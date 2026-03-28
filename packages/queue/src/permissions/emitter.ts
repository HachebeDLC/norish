import type { PermissionsSubscriptionEvents } from "./types";

import { createTypedEmitter, TypedEmitter } from "../redis/pubsub";

// Use globalThis to persist across HMR in development
declare global {
  var __permissionsEmitter__: TypedEmitter<PermissionsSubscriptionEvents> | undefined;
}

export const permissionsEmitter: TypedEmitter<PermissionsSubscriptionEvents> =
  globalThis.__permissionsEmitter__ ||
  (globalThis.__permissionsEmitter__ =
    createTypedEmitter<PermissionsSubscriptionEvents>("permissions"));
