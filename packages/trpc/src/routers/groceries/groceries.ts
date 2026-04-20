import type { GroceryUpdateDto } from "@norish/shared/contracts";

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertHouseholdAccess } from "@norish/auth/permissions";
import { getUnits } from "@norish/config/server-config-loader";
import {
  assignGroceryToStore,
  AssignGroceryToStoreInputSchema,
  createGroceries,
  deleteDoneGroceriesBefore,
  deleteDoneInStore,
  DeleteDoneGroceriesInputSchema,
  deleteGroceryByIds,
  getGroceriesByIds,
  getGroceryOwnerIds,
  getRecipeInfoForGroceries,
  GroceryCreateSchema,
  GroceryDeleteSchema,
  GroceryToggleSchema,
  GroceryUpdateBaseSchema,
  GroceryUpdateInputSchema,
  listGroceriesByUsers,
  markAllDoneInStore,
  MarkAllDoneGroceriesInputSchema,
  reorderGroceriesInStore,
  ReorderGroceriesInStoreInputSchema,
  updateGroceries,
} from "@norish/db";
import { listRecurringGroceriesByUsers } from "@norish/db/repositories/recurring-groceries";
import {
  findBestIngredientStorePreference,
  getStoreOwnerId,
  normalizeIngredientName,
  upsertIngredientStorePreference,
} from "@norish/db/repositories/stores";
import { GrocerySelectBaseSchema } from "@norish/shared/contracts/zod";
import { completeInBring } from "@norish/shared-server/services/bring/sync";
import { addBringSyncJob, groceryEmitter } from "@norish/queue";
import { getQueues } from "@norish/queue/registry";
import { trpcLogger as log } from "@norish/shared-server/logger";
import { parseIngredientWithDefaults } from "@norish/shared/lib/helpers";

import { authedProcedure } from "../../middleware";
import { router } from "../../trpc";

/**
 * Normalize a grocery name for duplicate checking.
 * Lowercases and trims whitespace.
 */
function normalizeGroceryName(name: string | null): string {
  return (name ?? "").toLowerCase().trim();
}

export const listGroceriesProcedure = authedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/groceries",
      protect: true,
      tags: ["Groceries"],
      summary: "List groceries for the current household",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .output(
    z.object({
      groceries: z.array(GrocerySelectBaseSchema),
      recurringGroceries: z.array(z.object({ id: z.string().uuid() }).passthrough()),
      recipeMap: z.record(
        z.string(),
        z.object({
          recipeId: z.string().uuid(),
          recipeName: z.string(),
        })
      ),
    })
  )
  .query(async ({ ctx }) => {
  log.debug({ userId: ctx.user.id }, "Listing groceries");

  const [groceries, recurringGroceries] = await Promise.all([
    listGroceriesByUsers(ctx.userIds),
    listRecurringGroceriesByUsers(ctx.userIds),
  ]);

  // Collect all recipeIngredientIds to fetch recipe info
  const recipeIngredientIds = groceries
    .map((g) => g.recipeIngredientId)
    .filter((id): id is string => id !== null);

  // Fetch recipe info for groceries that have a recipeIngredientId
  const recipeInfoMap = await getRecipeInfoForGroceries(recipeIngredientIds);

  // Convert Map to plain object for serialization
  const recipeMap: Record<string, { recipeId: string; recipeName: string }> = {};

  for (const [key, value] of recipeInfoMap) {
    recipeMap[key] = value;
  }

  log.debug(
    {
      userId: ctx.user.id,
      groceryCount: groceries.length,
      recurringCount: recurringGroceries.length,
      recipeMapSize: Object.keys(recipeMap).length,
    },
    "Groceries listed"
  );

  return { groceries, recurringGroceries, recipeMap };
});

export const createGroceryProcedure = authedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/groceries",
      protect: true,
      tags: ["Groceries"],
      summary: "Create one or more groceries",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .input(
    z.object({
      groceries: z.array(GroceryCreateSchema),
    })
  )
  .output(z.array(z.string().uuid()))
  .mutation(async ({ ctx, input }) => {
    const items = input.groceries;

    log.info({ userId: ctx.user.id, count: items.length }, "Creating groceries");

    // Get existing non-done groceries to check for duplicates
    const existingGroceries = await listGroceriesByUsers(ctx.userIds, { includeDone: false });

    // Build a map of (normalized name + recipeIngredientId + recurringGroceryId) -> existing grocery
    const existingByKey = new Map<string, (typeof existingGroceries)[0]>();

    for (const grocery of existingGroceries) {
      const normalizedName = normalizeGroceryName(grocery.name);

      if (normalizedName && !grocery.isDone) {
        const recipeKey = grocery.recipeIngredientId ?? "manual";
        const recurringKey = grocery.recurringGroceryId ?? "none";
        const key = `${normalizedName}|${recipeKey}|${recurringKey}`;

        if (!existingByKey.has(key)) {
          existingByKey.set(key, grocery);
        }
      }
    }

    const groceriesToCreate: Array<{
      id: string;
      groceries: {
        userId: string;
        name: string | null;
        unit: string | null;
        amount: number | null;
        isDone: boolean;
        recipeIngredientId: string | null;
        recurringGroceryId: string | null;
        storeId: string | null;
      };
    }> = [];
    const groceriesToUpdate: Array<{ id: string; amount: number | null }> = [];
    const createdItems: any[] = [];

    for (const grocery of items) {
      const normalizedName = normalizeGroceryName(grocery.name);
      const recipeKey = grocery.recipeIngredientId ?? "manual";
      const recurringKey = grocery.recurringGroceryId ?? "none";
      const lookupKey = normalizedName ? `${normalizedName}|${recipeKey}|${recurringKey}` : null;
      const existing = lookupKey ? existingByKey.get(lookupKey) : null;

      const shouldMerge =
        existing && (existing.unit === grocery.unit || (!existing.unit && !grocery.unit));

      if (shouldMerge && existing) {
        const existingAmount = existing.amount ?? 1;
        const newAmount = grocery.amount ?? 1;
        const mergedAmount = existingAmount + newAmount;

        groceriesToUpdate.push({ id: existing.id, amount: mergedAmount });
        createdItems.push({ id: existing.id, name: grocery.name, merged: true });

        existingByKey.set(lookupKey!, { ...existing, amount: mergedAmount });
      } else {
        const id = crypto.randomUUID();
        let storeId: string | null = grocery.storeId ?? null;

        if (!storeId && grocery.name) {
          const match = await findBestIngredientStorePreference(
            ctx.user.id,
            ctx.userIds,
            grocery.name
          );
          storeId = match?.preference.storeId ?? null;
        }

        groceriesToCreate.push({
          id,
          groceries: {
            userId: ctx.user.id,
            name: grocery.name,
            unit: grocery.unit,
            amount: grocery.amount,
            isDone: grocery.isDone ?? false,
            recipeIngredientId: grocery.recipeIngredientId ?? null,
            recurringGroceryId: grocery.recurringGroceryId ?? null,
            storeId,
          },
        });
        createdItems.push({ id, name: grocery.name, merged: false });

        if (lookupKey) {
          existingByKey.set(lookupKey, {
            id,
            name: grocery.name,
            unit: grocery.unit,
            amount: grocery.amount,
            isDone: false,
            recipeIngredientId: grocery.recipeIngredientId ?? null,
            recurringGroceryId: null,
            storeId,
            sortOrder: 0,
            version: 1,
          });
        }
      }
    }

    if (groceriesToUpdate.length > 0) {
      updateGroceries(groceriesToUpdate)
        .then(async (updatedGroceries) => {
          log.info({ userId: ctx.user.id, count: updatedGroceries.length }, "Groceries merged");
          groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
            changedGroceries: updatedGroceries,
          });
        })
        .catch((err) => {
          log.error({ err, userId: ctx.user.id }, "Failed to merge groceries");
        });
    }

    if (groceriesToCreate.length > 0) {
      const created = await createGroceries(groceriesToCreate, ctx.userIds);
      log.info({ userId: ctx.user.id, count: created.length }, "Groceries created");
      groceryEmitter.emitToHousehold(ctx.householdKey, "created", {
        groceries: created,
      });
    }

    return createdItems.map((i) => i.id);
  });

export const updateGroceryProcedure = authedProcedure.input(GroceryUpdateInputSchema).mutation(async ({ ctx, input }) => {
  const { groceryId, raw, version } = input;

  log.debug({ userId: ctx.user.id, groceryId, version }, "Updating grocery");

  const ownerIds = await getGroceryOwnerIds([groceryId]);
  const ownerId = ownerIds.get(groceryId);

  if (!ownerId) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Grocery not found",
    });
  }

  await assertHouseholdAccess(ctx.user.id, ownerId);

  const units = await getUnits();
  const parsedIngredient = parseIngredientWithDefaults(raw, units)[0];

  const updateData: GroceryUpdateDto = {
    id: groceryId,
    name: parsedIngredient.description,
    amount: parsedIngredient.quantity,
    unit: parsedIngredient.unitOfMeasure,
    version,
  };

  const updatedGroceries = await updateGroceries([updateData]);

  if (updatedGroceries.length === 0) {
    log.info({ userId: ctx.user.id, groceryId, version }, "Ignoring stale grocery update mutation");
    return { success: true, stale: true };
  }

  log.debug({ userId: ctx.user.id, groceryId }, "Grocery updated");
  groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
    changedGroceries: updatedGroceries,
  });

  return { success: true, grocery: updatedGroceries[0] };
});

export const markGroceryDoneProcedure = authedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/groceries/done",
      protect: true,
      tags: ["Groceries"],
      summary: "Mark groceries as completed",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .input(GroceryToggleSchema)
  .output(
    z.object({
      success: z.boolean(),
      updatedCount: z.number().optional(),
      stale: z.boolean().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
  const { groceries: inputGroceries, isDone } = input;

  if (!isDone) throw new TRPCError({ code: "BAD_REQUEST", message: "Use markGroceryUndone for undoing" });

  log.debug({ userId: ctx.user.id, count: inputGroceries.length }, "Marking groceries done");

  const groceryIds = inputGroceries.map(g => g.id);
  const ownerIds = await getGroceryOwnerIds(groceryIds);
  for (const ownerId of ownerIds.values()) {
    await assertHouseholdAccess(ctx.user.id, ownerId);
  }

  const currentGroceries = await getGroceriesByIds(groceryIds);
  const groceriesToUpdate = inputGroceries.map(inputG => {
    const current = currentGroceries.find(cg => cg.id === inputG.id);
    if (!current || current.version !== inputG.version) return null;

    return { ...current, isDone: true, version: inputG.version };
  }).filter((g): g is any => g !== null);

  if (groceriesToUpdate.length === 0) {
    log.info({ userId: ctx.user.id }, "Ignoring stale grocery mark done mutation");
    return { success: true, stale: true };
  }

  const updated = await updateGroceries(groceriesToUpdate);

  groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
    changedGroceries: updated,
  });

  for (const grocery of updated) {
    if (grocery.name) {
      completeInBring(ctx.user.id, grocery.name).catch((err) => {
        log.error({ err, itemName: grocery.name }, "Failed to complete item in Bring!");
      });
    }
  }

  return { success: true, updatedCount: updated.length };
});

export const markGroceryUndoneProcedure = authedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/groceries/undone",
      protect: true,
      tags: ["Groceries"],
      summary: "Mark groceries as not completed",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .input(GroceryToggleSchema)
  .output(
    z.object({
      success: z.boolean(),
      updatedCount: z.number().optional(),
      stale: z.boolean().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
  const { groceries: inputGroceries, isDone } = input;

  if (isDone) throw new TRPCError({ code: "BAD_REQUEST", message: "Use markGroceryDone for completion" });

  log.debug({ userId: ctx.user.id, count: inputGroceries.length }, "Marking groceries undone");

  const groceryIds = inputGroceries.map(g => g.id);
  const ownerIds = await getGroceryOwnerIds(groceryIds);
  for (const ownerId of ownerIds.values()) {
    await assertHouseholdAccess(ctx.user.id, ownerId);
  }

  const currentGroceries = await getGroceriesByIds(groceryIds);
  const groceriesToUpdate = inputGroceries.map(inputG => {
    const current = currentGroceries.find(cg => cg.id === inputG.id);
    if (!current || current.version !== inputG.version) return null;

    return { ...current, isDone: false, version: inputG.version };
  }).filter((g): g is any => g !== null);

  if (groceriesToUpdate.length === 0) {
    log.info({ userId: ctx.user.id }, "Ignoring stale grocery mark undone mutation");
    return { success: true, stale: true };
  }

  const updated = await updateGroceries(groceriesToUpdate);

  groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
    changedGroceries: updated,
  });

  return { success: true, updatedCount: updated.length };
});

export const deleteGroceryProcedure = authedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/groceries/delete",
      protect: true,
      tags: ["Groceries"],
      summary: "Delete one or more groceries",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .input(GroceryDeleteSchema)
  .output(
    z.object({
      success: z.boolean(),
      deletedCount: z.number(),
      staleCount: z.number(),
    })
  )
  .mutation(async ({ ctx, input }) => {
  const { groceries: inputGroceries } = input;

  log.info({ userId: ctx.user.id, count: inputGroceries.length }, "Deleting groceries");

  const groceryIds = inputGroceries.map(g => g.id);
  const ownerIds = await getGroceryOwnerIds(groceryIds);
  for (const ownerId of ownerIds.values()) {
    await assertHouseholdAccess(ctx.user.id, ownerId);
  }

  const { deletedIds, staleIds } = await deleteGroceryByIds(inputGroceries);

  if (deletedIds.length > 0) {
    log.info({ userId: ctx.user.id, count: deletedIds.length }, "Groceries deleted");
    groceryEmitter.emitToHousehold(ctx.householdKey, "deleted", { groceryIds: deletedIds });
  }

  return { success: true, deletedCount: deletedIds.length, staleCount: staleIds.length };
});

export const assignGroceryToStoreProcedure = authedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/groceries/assign-store",
      protect: true,
      tags: ["Groceries"],
      summary: "Assign a grocery item to a store",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .input(AssignGroceryToStoreInputSchema)
  .output(
    z.object({
      success: z.boolean(),
      grocery: GrocerySelectBaseSchema.optional(),
      stale: z.boolean().optional(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { groceryId, storeId, version, savePreference } = input;

    const [ownerIds, storeOwnerId] = await Promise.all([
      getGroceryOwnerIds([groceryId]),
      storeId ? getStoreOwnerId(storeId) : Promise.resolve(null),
    ]);

    const ownerId = ownerIds.get(groceryId);
    if (!ownerId) throw new TRPCError({ code: "NOT_FOUND", message: "Grocery not found" });
    await assertHouseholdAccess(ctx.user.id, ownerId);

    if (storeId) {
      if (!storeOwnerId) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
      await assertHouseholdAccess(ctx.user.id, storeOwnerId);
    }

    const [grocery] = await getGroceriesByIds([groceryId]);
    const updated = await assignGroceryToStore(groceryId, storeId, ctx.userIds, version);

    if (!updated) {
      log.info({ userId: ctx.user.id, groceryId, version }, "Ignoring stale grocery store assignment");
      return { success: true, stale: true };
    }

    if (savePreference && storeId && grocery?.name) {
      const normalized = normalizeIngredientName(grocery.name);
      await upsertIngredientStorePreference(ctx.user.id, normalized, storeId);
    }

    groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
      changedGroceries: [updated],
    });

    return { success: true, grocery: updated };
  });

export const reorderGroceriesInStoreProcedure = authedProcedure
  .input(ReorderGroceriesInStoreInputSchema)
  .mutation(async ({ ctx, input }) => {
    const { updates, savePreference } = input;
    if (updates.length === 0) return { success: true };

    const groceryIds = updates.map((u) => u.id);
    const ownerIds = await getGroceryOwnerIds(groceryIds);
    for (const ownerId of ownerIds.values()) {
      await assertHouseholdAccess(ctx.user.id, ownerId);
    }

    const updated = await reorderGroceriesInStore(updates);

    if (savePreference) {
      const itemsWithStoreChange = updates.filter((u) => u.storeId !== undefined && u.storeId !== null);
      if (itemsWithStoreChange.length > 0) {
        const groceriesForPreference = await getGroceriesByIds(itemsWithStoreChange.map((u) => u.id));
        for (const grocery of groceriesForPreference) {
          const update = itemsWithStoreChange.find((u) => u.id === grocery.id);
          if (update?.storeId && grocery.name) {
            await upsertIngredientStorePreference(ctx.user.id, normalizeIngredientName(grocery.name), update.storeId);
          }
        }
      }
    }

    if (updated.length > 0) {
      groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
        changedGroceries: updated,
      });
    }

    return { success: true, updatedCount: updated.length };
  });

export const markAllGroceriesDoneProcedure = authedProcedure
  .input(MarkAllDoneGroceriesInputSchema)
  .mutation(async ({ ctx, input }) => {
    const updated = await markAllDoneInStore(ctx.userIds, input.storeId, input.groceries);
    if (updated.length > 0) {
      groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
        changedGroceries: updated,
      });
    }

    return { success: true, updatedCount: updated.length };
  });

export const deleteDoneGroceriesProcedure = authedProcedure
  .input(DeleteDoneGroceriesInputSchema)
  .mutation(async ({ ctx, input }) => {
    const deletedIds = await deleteDoneInStore(ctx.userIds, input.storeId, input.groceries);
    if (deletedIds.length > 0) {
      groceryEmitter.emitToHousehold(ctx.householdKey, "deleted", { groceryIds: deletedIds });
    }

    return { success: true, deletedCount: deletedIds.length };
  });

export const syncToBringProcedure = authedProcedure
  .input(z.object({ itemIds: z.array(z.string()).optional() }))
  .mutation(async ({ ctx, input }) => {
    const { itemIds } = input;
    const queues = getQueues();

    const result = await addBringSyncJob(queues.bringSync, {
      userId: ctx.user.id,
      householdKey: ctx.householdKey,
      itemIds,
    });

    if (result.status === "duplicate") {
      throw new TRPCError({ code: "CONFLICT", message: "Bring! sync is already in progress" });
    }

    return { success: true, jobId: result.job.id };
  });

export const groceriesProcedures = router({
  list: listGroceriesProcedure,
  create: createGroceryProcedure,
  update: updateGroceryProcedure,
  toggle: markGroceryDoneProcedure, // Map toggle to markDone for now
  delete: deleteGroceryProcedure,
  assignToStore: assignGroceryToStoreProcedure,
  reorderInStore: reorderGroceriesInStoreProcedure,
  markAllDone: markAllGroceriesDoneProcedure,
  deleteDone: deleteDoneGroceriesProcedure,
  syncToBring: syncToBringProcedure,
});
