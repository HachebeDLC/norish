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
 * Maps HelloFresh recipe item to Norish FullRecipeInsertDTO.
 */
export function mapHelloFreshToNorish(hf: HelloFreshRecipeItem): FullRecipeInsertDTO {
  return {
    name: hf.name,
    description: hf.descriptionMarkdown || hf.headline,
    url: hf.cardLink || `https://www.hellofresh.es/recipes/${hf.id}`,
    image: hf.imagePath ? `https://img.hellofresh.com/f_auto,fl_lossy,q_auto/hellofresh_s3${hf.imagePath}` : undefined,
    servings: hf.yields?.[0]?.yields || 2,
    prepMinutes: parseIsoDuration(hf.prepTime),
    totalMinutes: parseIsoDuration(hf.totalTime),
    calories: hf.nutrition?.find((n: any) => n.type === "Energy")?.amount,
    fat: hf.nutrition?.find((n: any) => n.type === "Fat")?.amount,
    carbs: hf.nutrition?.find((n: any) => n.type === "Carbohydrate")?.amount,
    protein: hf.nutrition?.find((n: any) => n.type === "Protein")?.amount,
    
    // Tags
    tags: hf.tags?.map((t: any) => t.name) || [],
    
    // Ingredients
    recipeIngredients: hf.ingredients?.map((i: any, index: number) => ({
      ingredientName: i.name,
      amount: i.amount,
      unit: i.unit,
      order: index,
      systemUsed: "metric"
    })) || [],
    
    // Steps
    steps: hf.steps?.map((s: any) => ({
      order: s.index,
      instructions: s.instructionsMarkdown,
      images: s.images?.map((img: any) => ({
        path: img.path ? `https://img.hellofresh.com/f_auto,fl_lossy,q_auto/hellofresh_s3${img.path}` : ""
      })) || []
    })) || [],
    
    // Default categories if none provided
    categories: [] 
  };
}
