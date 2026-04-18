import type { GroceryUpdateDto } from "@norish/shared/contracts";

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertHouseholdAccess } from "@norish/auth/permissions";
import { getUnits } from "@norish/config/server-config-loader";
import {
  assignGroceryToStore,
  createGroceries,
  deleteDoneInStore,
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
  reorderGroceriesInStore,
  updateGroceries,
} from "@norish/db";
import { listRecurringGroceriesByUsers } from "@norish/db/repositories/recurring-groceries";
import {
  findBestIngredientStorePreference,
  getStoreOwnerId,
  normalizeIngredientName,
  upsertIngredientStorePreference,
} from "@norish/db/repositories/stores";
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

export const listGroceriesProcedure = authedProcedure.query(async ({ ctx }) => {
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
  .input(z.array(GroceryCreateSchema))
  .mutation(async ({ ctx, input }) => {
    log.info({ userId: ctx.user.id, count: input.length }, "Creating groceries");

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
    const returnIds: string[] = [];

    for (const grocery of input) {
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
        returnIds.push(existing.id);

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
        returnIds.push(id);

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
      createGroceries(groceriesToCreate, ctx.userIds)
        .then((createdGroceries) => {
          log.info({ userId: ctx.user.id, count: createdGroceries.length }, "Groceries created");
          groceryEmitter.emitToHousehold(ctx.householdKey, "created", {
            groceries: createdGroceries,
          });
        })
        .catch((err) => {
          log.error({ err, userId: ctx.user.id }, "Failed to create groceries");
          groceryEmitter.emitToHousehold(ctx.householdKey, "failed", {
            reason: "Failed to create grocery items",
          });
        });
    }

    return returnIds;
  });

export const updateGroceryProcedure = authedProcedure.input(GroceryUpdateInputSchema).mutation(({ ctx, input }) => {
  const { groceryId, raw } = input;

  log.debug({ userId: ctx.user.id, groceryId }, "Updating grocery");

  getGroceryOwnerIds([groceryId])
    .then(async (ownerIds) => {
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
      };

      const parsed = GroceryUpdateBaseSchema.safeParse(updateData);

      if (!parsed.success) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid grocery data",
        });
      }

      const updatedGroceries = await updateGroceries([parsed.data as GroceryUpdateDto]);

      log.debug({ userId: ctx.user.id, groceryId }, "Grocery updated");
      groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
        changedGroceries: updatedGroceries,
      });
    })
    .catch((err) => {
      log.error({ err, userId: ctx.user.id, groceryId }, "Failed to update grocery");
      groceryEmitter.emitToHousehold(ctx.householdKey, "failed", {
        reason: err.message || "Failed to update grocery",
      });
    });

  return { success: true };
});

export const markGroceryDoneProcedure = authedProcedure.input(GroceryToggleSchema).mutation(({ ctx, input }) => {
  const { groceryIds, isDone } = input;

  if (!isDone) throw new TRPCError({ code: "BAD_REQUEST", message: "Use markGroceryUndone for undoing" });

  log.debug({ userId: ctx.user.id, count: groceryIds.length }, "Marking groceries done");

  getGroceryOwnerIds(groceryIds)
    .then(async (ownerIds) => {
      for (const ownerId of ownerIds.values()) {
        await assertHouseholdAccess(ctx.user.id, ownerId);
      }

      const groceries = await getGroceriesByIds(groceryIds);
      const updatedGroceries = groceries.map((grocery) => ({ ...grocery, isDone: true }));

      const updated = await updateGroceries(updatedGroceries as GroceryUpdateDto[]);

      groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
        changedGroceries: updated,
      });

      for (const grocery of groceries) {
        if (grocery.name) {
          completeInBring(ctx.user.id, grocery.name).catch((err) => {
            log.error({ err, itemName: grocery.name }, "Failed to complete item in Bring!");
          });
        }
      }
    })
    .catch((err) => {
      log.error({ err, userId: ctx.user.id, groceryIds }, "Failed to mark groceries done");
    });

  return { success: true };
});

export const markGroceryUndoneProcedure = authedProcedure.input(GroceryToggleSchema).mutation(({ ctx, input }) => {
  const { groceryIds, isDone } = input;

  if (isDone) throw new TRPCError({ code: "BAD_REQUEST", message: "Use markGroceryDone for completion" });

  log.debug({ userId: ctx.user.id, count: groceryIds.length }, "Marking groceries undone");

  getGroceryOwnerIds(groceryIds)
    .then(async (ownerIds) => {
      for (const ownerId of ownerIds.values()) {
        await assertHouseholdAccess(ctx.user.id, ownerId);
      }

      const groceries = await getGroceriesByIds(groceryIds);
      const updatedGroceries = groceries.map((grocery) => ({ ...grocery, isDone: false }));

      const updated = await updateGroceries(updatedGroceries as GroceryUpdateDto[]);

      groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
        changedGroceries: updated,
      });
    })
    .catch((err) => {
      log.error({ err, userId: ctx.user.id, groceryIds }, "Failed to mark groceries undone");
    });

  return { success: true };
});

export const deleteGroceryProcedure = authedProcedure.input(GroceryDeleteSchema).mutation(({ ctx, input }) => {
  const { groceryIds } = input;

  log.info({ userId: ctx.user.id, count: groceryIds.length }, "Deleting groceries");

  getGroceryOwnerIds(groceryIds)
    .then(async (ownerIds) => {
      for (const ownerId of ownerIds.values()) {
        await assertHouseholdAccess(ctx.user.id, ownerId);
      }

      await deleteGroceryByIds(groceryIds);

      log.info({ userId: ctx.user.id, count: groceryIds.length }, "Groceries deleted");
      groceryEmitter.emitToHousehold(ctx.householdKey, "deleted", { groceryIds });
    })
    .catch((err) => {
      log.error({ err, userId: ctx.user.id, groceryIds }, "Failed to delete groceries");
    });

  return { success: true };
});

export const assignGroceryToStoreProcedure = authedProcedure
  .input(
    z.object({
      groceryId: z.uuid(),
      storeId: z.uuid().nullable(),
      savePreference: z.boolean().default(true),
    })
  )
  .mutation(({ ctx, input }) => {
    const { groceryId, storeId, savePreference } = input;

    Promise.all([
      getGroceryOwnerIds([groceryId]),
      storeId ? getStoreOwnerId(storeId) : Promise.resolve(null),
    ])
      .then(async ([ownerIds, storeOwnerId]) => {
        const ownerId = ownerIds.get(groceryId);
        if (!ownerId) throw new TRPCError({ code: "NOT_FOUND", message: "Grocery not found" });
        await assertHouseholdAccess(ctx.user.id, ownerId);

        if (storeId) {
          if (!storeOwnerId) throw new TRPCError({ code: "NOT_FOUND", message: "Store not found" });
          await assertHouseholdAccess(ctx.user.id, storeOwnerId);
        }

        const [grocery] = await getGroceriesByIds([groceryId]);
        const updated = await assignGroceryToStore(groceryId, storeId, ctx.userIds);

        if (savePreference && storeId && grocery?.name) {
          const normalized = normalizeIngredientName(grocery.name);
          await upsertIngredientStorePreference(ctx.user.id, normalized, storeId);
        }

        groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
          changedGroceries: [updated],
        });
      })
      .catch((err) => {
        log.error({ err, userId: ctx.user.id, groceryId, storeId }, "Failed to assign grocery to store");
      });

    return { success: true };
  });

export const reorderGroceriesInStoreProcedure = authedProcedure
  .input(
    z.object({
      updates: z.array(
        z.object({
          id: z.uuid(),
          sortOrder: z.number().int().min(0),
          storeId: z.uuid().nullable().optional(),
        })
      ),
      savePreference: z.boolean().default(true),
    })
  )
  .mutation(({ ctx, input }) => {
    const { updates, savePreference } = input;
    if (updates.length === 0) return { success: true };

    const groceryIds = updates.map((u) => u.id);
    getGroceryOwnerIds(groceryIds)
      .then(async (ownerIds) => {
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

        groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
          changedGroceries: updated,
        });
      })
      .catch((err) => {
        log.error({ err, userId: ctx.user.id }, "Failed to reorder groceries");
      });

    return { success: true };
  });

export const markAllGroceriesDoneProcedure = authedProcedure
  .input(z.object({ storeId: z.uuid().nullable() }))
  .mutation(({ ctx, input }) => {
    markAllDoneInStore(ctx.userIds, input.storeId)
      .then((updated) => {
        if (updated.length > 0) {
          groceryEmitter.emitToHousehold(ctx.householdKey, "updated", {
            changedGroceries: updated,
          });
        }
      })
      .catch((err) => {
        log.error({ err, userId: ctx.user.id }, "Failed to mark groceries done");
      });

    return { success: true };
  });

export const deleteDoneGroceriesProcedure = authedProcedure
  .input(z.object({ storeId: z.uuid().nullable() }))
  .mutation(({ ctx, input }) => {
    deleteDoneInStore(ctx.userIds, input.storeId)
      .then((deletedIds) => {
        if (deletedIds.length > 0) {
          groceryEmitter.emitToHousehold(ctx.householdKey, "deleted", { groceryIds: deletedIds });
        }
      })
      .catch((err) => {
        log.error({ err, userId: ctx.user.id }, "Failed to delete done groceries");
      });

    return { success: true };
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
