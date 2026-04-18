import { createTagsHooks } from '@norish/shared-react/hooks';

import { useTRPC } from '@/providers/trpc-provider';

const sharedTagsHooks = createTagsHooks({ useTRPC });

export const useGroupedTagsQuery = sharedTagsHooks.useGroupedTagsQuery;
