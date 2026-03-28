import { createPolicyAwareSubscription } from "../../helpers";
import { router } from "../../trpc";

import { ratingsEmitter } from "@norish/queue";

const onRatingUpdated = createPolicyAwareSubscription(
  ratingsEmitter,
  "ratingUpdated",
  "rating updates"
);
const onRatingFailed = createPolicyAwareSubscription(
  ratingsEmitter,
  "ratingFailed",
  "rating failures"
);

export const ratingsSubscriptions = router({
  onRatingUpdated,
  onRatingFailed,
});
