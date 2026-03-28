import { router } from "../../trpc";

import { ratingsProcedures } from "./ratings";
import { ratingsSubscriptions } from "./subscriptions";

export { ratingsEmitter } from "@norish/queue";
export type { RatingSubscriptionEvents } from "@norish/queue";

export const ratingsRouter = router({
  ...ratingsProcedures._def.procedures,
  ...ratingsSubscriptions._def.procedures,
});
export * from "./types";
