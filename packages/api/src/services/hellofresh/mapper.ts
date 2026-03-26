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
 * Maps HelloFresh recipe item to Norish FullRecipeInsertDTO.
 * Now with full support for quantities, units, and optimized images.
 */
export function mapHelloFreshToNorish(hf: HelloFreshRecipeItem): FullRecipeInsertDTO {
  const description = hf.descriptionMarkdown || hf.headline || "";
  
  const tags = hf.tags?.map((t: any) => ({ name: t.name })) || [];
  
  if (hf.difficulty === 1) tags.push({ name: "Difficulty: Easy" });
  else if (hf.difficulty === 2) tags.push({ name: "Difficulty: Medium" });
  else if (hf.difficulty === 3) tags.push({ name: "Difficulty: Hard" });

  if (hf.cuisines) {
    hf.cuisines.forEach((c: any) => tags.push({ name: `Cuisine: ${c.name}` }));
  }
  if (hf.utensils) {
    hf.utensils.forEach((u: any) => tags.push({ name: `Utensil: ${u.name}` }));
  }

  // Optimize Image URL (using fill to make sure they look good in Norish cards)
  const mainImage = hf.imagePath 
    ? `https://img.hellofresh.com/c_fill,f_auto,fl_lossy,q_auto,w_1200/hellofresh_s3${hf.imagePath}` 
    : undefined;

  // Extract quantities from yields (defaulting to the first yield, usually 2 people)
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

  return {
    name: hf.name,
    description: description,
    url: hf.canonical || hf.cardLink || `https://www.hellofresh.es/recipes/${hf.id}`,
    image: mainImage,
    servings: cleanNumber(defaultYield?.yields) || 2,
    prepMinutes: parseIsoDuration(hf.prepTime),
    totalMinutes: parseIsoDuration(hf.totalTime),
    
    calories: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Energy")?.amount),
    fat: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Fat")?.amount),
    carbs: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Carbohydrate")?.amount),
    protein: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Protein")?.amount),
    
    tags: tags,
    
    recipeIngredients: hf.ingredients?.map((i: any, index: number) => {
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
      images: s.images?.map((img: any) => ({
        path: img.path ? `https://img.hellofresh.com/f_auto,fl_lossy,q_auto,w_800/hellofresh_s3${img.path}` : ""
      })) || []
    })) || [],
    
    categories: [] 
  };
}
