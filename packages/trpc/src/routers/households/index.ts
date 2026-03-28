import { router } from "../../trpc";

import { householdsRouter } from "./households";
import { householdSubscriptionsRouter } from "./subscriptions";

export { householdEmitter, type HouseholdSubscriptionEvents, type HouseholdUserInfo } from "@norish/queue";

export const householdsAppRouter = router({
  ...householdsRouter._def.procedures,
  ...householdSubscriptionsRouter._def.procedures,
});
export * from "./types";
