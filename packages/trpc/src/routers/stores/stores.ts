import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertHouseholdAccess } from "@norish/auth/permissions";
import {
  checkStoreNameExistsInHousehold,
  countGroceriesInStore,
  createStore,
  deleteStore,
  getStoreOwnerId,
  listStoresByUserIds,
  reorderStores,
  updateStore,
} from "@norish/db/repositories/stores";
import { trpcLogger as log } from "@norish/shared-server/logger";
import {
  StoreCreateSchema,
  StoreDeleteSchema,
  StoreReorderSchema,
  StoreSelectBaseSchema,
  StoreUpdateInputSchema,
} from "@norish/shared/contracts/zod";

import { authedProcedure } from "../../middleware";
import { router } from "../../trpc";
import { groceryEmitter } from "@norish/queue";

import { storeEmitter } from "@norish/queue";

export const listStoresProcedure = authedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/stores",
      protect: true,
      tags: ["Stores"],
      summary: "List stores for the current household",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .output(z.array(StoreSelectBaseSchema))
  .query(async ({ ctx }) => {
  log.debug({ userId: ctx.user.id }, "Listing stores");

  const stores = await listStoresByUserIds(ctx.userIds);

  log.debug({ userId: ctx.user.id, storeCount: stores.length }, "Stores listed");

  return stores;
});

export const createStoreProcedure = authedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/stores",
      protect: true,
      tags: ["Stores"],
      summary: "Create a new store",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .input(StoreCreateSchema)
  .output(StoreSelectBaseSchema)
  .mutation(async ({ ctx, input }) => {
  const storeId = crypto.randomUUID();

  log.info({ userId: ctx.user.id, storeName: input.name }, "Creating store");

  // Check for duplicate name in household
  const exists = await checkStoreNameExistsInHousehold(input.name, ctx.userIds);

  if (exists) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "A store with this name already exists",
    });
  }

  const storeData = {
    userId: ctx.user.id,
    name: input.name,
    color: input.color ?? "primary",
    icon: input.icon ?? "ShoppingBagIcon",
    sortOrder: 0,
  };

  const createdStore = await createStore(storeId, storeData);
  log.info({ userId: ctx.user.id, storeId: createdStore.id }, "Store created");
  storeEmitter.emitToHousehold(ctx.householdKey, "created", {
    store: createdStore,
  });

  return createdStore;
});

export const updateStoreProcedure = authedProcedure.input(StoreUpdateInputSchema).mutation(async ({ ctx, input }) => {
  log.debug({ userId: ctx.user.id, storeId: input.id }, "Updating store");

  // Check ownership
  const ownerId = await getStoreOwnerId(input.id);

  if (!ownerId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  await assertHouseholdAccess(ctx.user.id, ownerId);

  // Check for duplicate name if name is being changed
  if (input.name) {
    const exists = await checkStoreNameExistsInHousehold(input.name, ctx.userIds, input.id);

    if (exists) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "A store with this name already exists",
      });
    }
  }

  const updatedStore = await updateStore(input);
  if (!updatedStore) {
    log.info({ userId: ctx.user.id, storeId: input.id, version: input.version }, "Ignoring stale store update mutation");
    return { success: true, stale: true };
  }

  log.info({ userId: ctx.user.id, storeId: updatedStore.id }, "Store updated");
  storeEmitter.emitToHousehold(ctx.householdKey, "updated", {
    store: updatedStore,
  });

  return updatedStore;
});

export const deleteStoreProcedure = authedProcedure.input(StoreDeleteSchema).mutation(async ({ ctx, input }) => {
  const { storeId, version, deleteGroceries, grocerySnapshot } = input;

  log.info({ userId: ctx.user.id, storeId, deleteGroceries }, "Deleting store");

  // Check ownership
  const ownerId = await getStoreOwnerId(storeId);

  if (!ownerId) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
  }
  await assertHouseholdAccess(ctx.user.id, ownerId);

  const { deletedGroceryIds, storeDeleted, stale } = await deleteStore(storeId, version, deleteGroceries, grocerySnapshot);

  if (stale) {
    log.info({ userId: ctx.user.id, storeId, version }, "Ignoring stale store deletion");
    return { success: true, deleted: false, stale: true };
  }

  if (storeDeleted) {
    log.info(
      { userId: ctx.user.id, storeId, deletedGroceryCount: deletedGroceryIds.length },
      "Store deleted"
    );

    // Emit store deleted event
    storeEmitter.emitToHousehold(ctx.householdKey, "deleted", {
      storeId,
      deletedGroceryIds,
    });

    // If groceries were deleted, also emit grocery deleted event
    if (deletedGroceryIds.length > 0) {
      groceryEmitter.emitToHousehold(ctx.householdKey, "deleted", {
        groceryIds: deletedGroceryIds,
      });
    }
  }

  return { success: true, deleted: storeDeleted, deletedGroceryIds };
});

export const reorderStoresProcedure = authedProcedure.input(StoreReorderSchema).mutation(async ({ ctx, input }) => {
  log.debug({ userId: ctx.user.id, storeCount: input.stores.length }, "Reordering stores");

  const reorderedStores = await reorderStores(input.stores);
  log.info({ userId: ctx.user.id, storeCount: reorderedStores.length }, "Stores reordered");

  if (reorderedStores.length > 0) {
    storeEmitter.emitToHousehold(ctx.householdKey, "reordered", {
      stores: reorderedStores,
    });
  }

  return reorderedStores;
});

export const getGroceryCountProcedure = authedProcedure
  .input(z.object({ storeId: z.uuid() }))
  .query(async ({ ctx, input }) => {
    const ownerId = await getStoreOwnerId(input.storeId);

    if (!ownerId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
    }
    await assertHouseholdAccess(ctx.user.id, ownerId);

    return countGroceriesInStore(input.storeId);
  });

export const storesProcedures = router({
  list: listStoresProcedure,
  create: createStoreProcedure,
  update: updateStoreProcedure,
  delete: deleteStoreProcedure,
  reorder: reorderStoresProcedure,
  getGroceryCount: getGroceryCountProcedure,
});
