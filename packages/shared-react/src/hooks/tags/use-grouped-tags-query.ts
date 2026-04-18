import { useQuery } from "@tanstack/react-query";
import type { CreateConfigHooksOptions } from "../config/types";

export function createUseGroupedTagsQuery({ useTRPC }: CreateConfigHooksOptions) {
  return function useGroupedTagsQuery() {
    const trpc = useTRPC();

    const { data, error, isLoading } = useQuery({
      ...trpc.tags.listByCategories.queryOptions({}),
      staleTime: 5 * 60 * 1000,
    });

    return {
      groupedTags: data ?? {},
      error,
      isLoading,
    };
  };
}
