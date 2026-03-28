import type { GrocerySubscriptionEvents } from "./types";

import { createTypedEmitter, TypedEmitter } from "../redis/pubsub";

// Use globalThis to persist across HMR in development
declare global {
  var __groceryEmitter__: TypedEmitter<GrocerySubscriptionEvents> | undefined;
}

export const groceryEmitter: TypedEmitter<GrocerySubscriptionEvents> =
  globalThis.__groceryEmitter__ ||
  (globalThis.__groceryEmitter__ = createTypedEmitter<GrocerySubscriptionEvents>("grocery"));
