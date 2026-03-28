import { router } from "../../trpc";

import { permissionsProcedures } from "./permissions";
import { permissionsSubscriptions } from "./subscriptions";

export { permissionsEmitter } from "@norish/queue";
export type { PermissionsSubscriptionEvents } from "@norish/queue";

export const permissionsRouter = router({
  ...permissionsProcedures._def.procedures,
  ...permissionsSubscriptions._def.procedures,
});
export * from "./types";
