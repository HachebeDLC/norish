import { TagListInputSchema } from "@norish/shared/contracts/zod/tag";
import { listTags } from "@norish/db/repositories/tags";
import { authedProcedure } from "../middleware";
import { router } from "../trpc";

const list = authedProcedure.input(TagListInputSchema).query(async ({ input }) => {
  const { categories, search, limit } = input;
  return await listTags(categories, search, limit);
});

const listByCategories = authedProcedure.input(TagListInputSchema).query(async ({ input }) => {
  const { categories, search, limit } = input;
  const tags = await listTags(categories, search, limit);
  
  // Group by category
  const grouped: Record<string, typeof tags> = {};
  for (const tag of tags) {
    if (!grouped[tag.category]) {
      grouped[tag.category] = [];
    }
    grouped[tag.category].push(tag);
  }
  
  return grouped;
});

export const tagsRouter = router({
  list,
  listByCategories,
});
