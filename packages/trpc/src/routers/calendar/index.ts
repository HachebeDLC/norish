import { router } from "../../trpc";

import { plannedItemsProcedures } from "./planned-items";
import { calendarSubscriptions } from "./subscriptions";

export { calendarEmitter } from "@norish/queue";
export type { CalendarSubscriptionEvents } from "@norish/queue";

export const calendarRouter = router({
  ...calendarSubscriptions._def.procedures,
  ...plannedItemsProcedures._def.procedures,
});
export * from "./types";
