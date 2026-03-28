import { router } from "../../trpc";

import { storesProcedures } from "./stores";
import { storesSubscriptions } from "./subscriptions";

export { storeEmitter } from "@norish/queue";
export type { StoreSubscriptionEvents } from "@norish/queue";

export const storesRouter = router({
  ...storesProcedures._def.procedures,
  ...storesSubscriptions._def.procedures,
});
export * from "./types";
