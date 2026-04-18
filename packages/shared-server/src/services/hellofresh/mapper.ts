import { FullRecipeInsertDTO } from "@norish/shared/contracts/dto/recipe";
import { HelloFreshRecipeItem } from "./client";

/**
 * Parses ISO 8601 duration (e.g. PT30M) to minutes.
 */
function parseIsoDuration(duration: string): number {
  if (!duration || duration === "PT") return 0;
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  
  return hours * 60 + minutes;
}

/**
 * Ensures a value is a number or null, avoiding NaN.
 */
function cleanNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return isNaN(num) ? null : num;
}

/**
 * Finds a nutrition value by type, matching case-insensitively and handling
 * common locale variants (e.g. "Carbohydrate" vs "Carbohydrates", "Energy" vs "Calories").
 */
function findNutrition(
  nutrition: Array<{ type: string; amount: number | null }> | null | undefined,
  ...typeVariants: string[]
): number | null {
  if (!nutrition) return null;

  const lower = typeVariants.map((v) => v.toLowerCase());

  const match = nutrition.find((n) => lower.some((v) => n.type.toLowerCase().startsWith(v)));

  return cleanNumber(match?.amount ?? null);
}

/**
 * Converts a kebab-case slug to Title Case (e.g. "middle-eastern" → "Middle Eastern").
 * Used to normalize locale-specific cuisine names to English using the locale-independent slug.
 */
function slugToTitleCase(slug: string): string {
  return slug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Maps HelloFresh recipe item to Norish FullRecipeInsertDTO.
 * Recognized format from HelloFresh API v2.
 */
export function mapHelloFreshToNorish(hf: HelloFreshRecipeItem): FullRecipeInsertDTO {
  // Use canonicalLink for external URL to prevent 404s
  const recipeUrl = (hf as any).canonicalLink || hf.cardLink || `https://www.hellofresh.es/recipes/${hf.id}`;
  
  const description = hf.descriptionMarkdown || hf.description || hf.headline || "";
  
  const tags = hf.tags?.map((t: any) => ({ name: t.name })) || [];
  
  if (hf.difficulty === 1) tags.push({ name: "Difficulty: Easy" });
  else if (hf.difficulty === 2) tags.push({ name: "Difficulty: Intermediate" });
  else if (hf.difficulty === 3) tags.push({ name: "Difficulty: Advanced" });

  if (hf.cuisines) {
    hf.cuisines.forEach((c: any) => {
      const cuisineName = c.slug ? slugToTitleCase(c.slug) : c.name;
      tags.push({ name: `Cuisine: ${cuisineName}` });
    });
  }
  if (hf.utensils) {
    hf.utensils.forEach((u: any) => tags.push({ name: `Utensil: ${u.name}` }));
  }
  if (hf.allergens) {
    hf.allergens.forEach((a: any) => tags.push({ name: `Allergen: ${a.name}` }));
  }

  // Optimize Image URL (High Resolution with Fill)
  const mainImage = hf.imagePath 
    ? `https://img.hellofresh.com/c_fill,f_auto,fl_lossy,q_auto,w_1200/hellofresh_s3${hf.imagePath}` 
    : (hf as any).imageLink;

  // Extract quantities from yields (default to 2 people or first available)
  const defaultYield = hf.yields?.[0];
  const ingredientQuantities = new Map<string, { amount: number | null, unit: string }>();
  
  if (defaultYield?.ingredients) {
    for (const yi of defaultYield.ingredients) {
      ingredientQuantities.set(yi.id, {
        amount: cleanNumber(yi.amount),
        unit: yi.unit || ""
      });
    }
  }

  const prepMinutes = parseIsoDuration(hf.prepTime);
  const totalMinutes = parseIsoDuration(hf.totalTime);
  const cookMinutes = totalMinutes > prepMinutes ? totalMinutes - prepMinutes : null;

  return {
    name: hf.name,
    description: description,
    url: recipeUrl,
    image: mainImage || null,
    servings: cleanNumber(defaultYield?.yields) || 2,
    prepMinutes,
    cookMinutes,
    totalMinutes,

    calories: findNutrition(hf.nutrition, "energy", "calorie", "kcal"),
    fat: findNutrition(hf.nutrition, "fat"),
    carbs: findNutrition(hf.nutrition, "carbohydrate", "carb"),
    protein: findNutrition(hf.nutrition, "protein"),
    
    tags: tags,
    
    recipeIngredients: hf.ingredients?.map((i: any, index: number) => {
      // API v2 mapping: ingredients in yields use the 'id' of the ingredient
      const q = ingredientQuantities.get(i.id);
      return {
        ingredientName: i.name,
        ingredientId: null,
        amount: q?.amount ?? null,
        unit: q?.unit || "",
        order: index,
        systemUsed: "metric"
      };
    }) || [],
    
    steps: hf.steps?.map((s: any) => ({
      order: s.index,
      step: s.instructionsMarkdown || s.instructions || "",
      systemUsed: "metric",
      images: s.images?.flatMap((img: any, imgIdx: number) => {
        const imageUrl =
          img.link ||
          (img.path ? `https://img.hellofresh.com/f_auto,fl_lossy,q_auto,w_800/hellofresh_s3${img.path}` : null);
        if (!imageUrl) return [];
        return [{ image: imageUrl, order: imgIdx }];
      }) || []
    })) || [],
    
    categories: [] 
  };
}
