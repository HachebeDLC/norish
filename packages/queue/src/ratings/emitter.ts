import type { RatingSubscriptionEvents } from "./types";

import { createTypedEmitter, TypedEmitter } from "../redis/pubsub";

declare global {
  var __ratingsEmitter__: TypedEmitter<RatingSubscriptionEvents> | undefined;
}

export const ratingsEmitter: TypedEmitter<RatingSubscriptionEvents> =
  globalThis.__ratingsEmitter__ ||
  (globalThis.__ratingsEmitter__ = createTypedEmitter<RatingSubscriptionEvents>("rating"));
