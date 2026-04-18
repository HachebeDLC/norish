import type { CreateConfigHooksOptions } from "../config/types";
import { createUseGroupedTagsQuery } from "./use-grouped-tags-query";

export function createTagsHooks(options: CreateConfigHooksOptions) {
  return {
    useGroupedTagsQuery: createUseGroupedTagsQuery(options),
  };
}
