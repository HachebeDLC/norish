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
 * Aiming for maximum data parity with the original Laravel project.
 */
export function mapHelloFreshToNorish(hf: HelloFreshRecipeItem): FullRecipeInsertDTO {
  // Parity logic for description: use headline if description is thin
  const description = hf.descriptionMarkdown || hf.headline || "";
  
  // Parity logic for difficulty: HF (1-3) 
  // Norish doesn't have a numeric difficulty in the base schema but we can add it as a tag
  const tags = hf.tags?.map((t: any) => ({ name: t.name })) || [];
  
  if (hf.difficulty === 1) tags.push({ name: "Difficulty: Easy" });
  else if (hf.difficulty === 2) tags.push({ name: "Difficulty: Medium" });
  else if (hf.difficulty === 3) tags.push({ name: "Difficulty: Hard" });

  // Parity logic for Cuisines & Utensils (Adding them as tags for searchability in Norish)
  if (hf.cuisines) {
    hf.cuisines.forEach((c: any) => tags.push({ name: `Cuisine: ${c.name}` }));
  }
  if (hf.utensils) {
    hf.utensils.forEach((u: any) => tags.push({ name: `Utensil: ${u.name}` }));
  }

  // Parity logic for Allergens
  if (hf.allergens) {
    hf.allergens.forEach((a: any) => tags.push({ name: `Allergen: ${a.name}` }));
  }

  return {
    name: hf.name,
    description: description,
    url: hf.canonical || hf.cardLink || `https://www.hellofresh.es/recipes/${hf.id}`,
    image: hf.imagePath ? `https://img.hellofresh.com/f_auto,fl_lossy,q_auto/hellofresh_s3${hf.imagePath}` : undefined,
    servings: cleanNumber(hf.yields?.[0]?.yields) || 2,
    prepMinutes: parseIsoDuration(hf.prepTime),
    totalMinutes: parseIsoDuration(hf.totalTime),
    
    // Nutrition parity
    calories: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Energy")?.amount),
    fat: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Fat")?.amount),
    carbs: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Carbohydrate")?.amount),
    protein: cleanNumber(hf.nutrition?.find((n: any) => n.type === "Protein")?.amount),
    
    tags: tags,
    
    // Ingredient parity (including image hints if we want to store them in Norish later)
    recipeIngredients: hf.ingredients?.map((i: any, index: number) => ({
      ingredientName: i.name,
      ingredientId: null,
      amount: cleanNumber(i.amount),
      unit: i.unit,
      order: index,
      systemUsed: "metric"
    })) || [],
    
    // Step parity (including markdown support and step images)
    steps: hf.steps?.map((s: any) => ({
      order: s.index,
      step: s.instructionsMarkdown || s.instructions || "",
      systemUsed: "metric",
      images: s.images?.map((img: any) => ({
        path: img.path ? `https://img.hellofresh.com/f_auto,fl_lossy,q_auto/hellofresh_s3${img.path}` : ""
      })) || []
    })) || [],
    
    categories: [] 
  };
}
