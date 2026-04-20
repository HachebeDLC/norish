import {
  PlannedItemDeleteInputSchema,
  PlannedItemMoveInputSchema,
  PlannedItemUpdateInputSchema,
  type PlannedItemWithRecipePayload,
  PlannedItemWithRecipePayloadSchema,
  type SlotItemSortUpdate,
} from "@norish/shared/contracts/zod";

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertHouseholdAccess } from "@norish/auth/permissions";
import {
  createPlannedItem,
  deletePlannedItem,
  getPlannedItemById,
  getPlannedItemWithRecipeById,
  listPlannedItemsByUserAndDateRange,
  listPlannedItemsWithRecipeBySlot,
  moveItem,
  updatePlannedItem,
} from "@norish/db/repositories/planned-items";
import { trpcLogger as log } from "@norish/shared-server/logger";

import { authedProcedure } from "../../middleware";
import { router } from "../../trpc";

import { calendarEmitter } from "@norish/queue";

const slotSchema = z.enum(["Breakfast", "Lunch", "Dinner", "Snack"]);
const itemTypeSchema = z.enum(["recipe", "note"]);

const listItemsInput = z.object({
  startISO: z.string(),
  endISO: z.string(),
});

const createItemInput = z
  .object({
    date: z.string(),
    slot: slotSchema,
    itemType: itemTypeSchema.default("recipe"),
    recipeId: z.string().uuid().optional(),
    title: z.string().optional(),
  })
  .refine((data) => data.itemType !== "recipe" || data.recipeId, {
    message: "recipeId is required for recipe items",
  })
  .refine((data) => data.itemType !== "note" || data.title, {
    message: "title is required for note items",
  });

function formatDate(date: Date): string {
  return date.toISOString().split("T")[0]!;
}

export const listItemsProcedure = authedProcedure.input(listItemsInput).query(async ({ ctx, input }) => {
  const { startISO, endISO } = input;
  return listPlannedItemsByUserAndDateRange(ctx.userIds, startISO, endISO);
});

export const listTodayPlannedRecipesProcedure = authedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/calendar/today",
      protect: true,
      tags: ["Planned Recipes"],
      summary: "List recipes planned for today",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .output(z.array(PlannedItemWithRecipePayloadSchema))
  .query(async ({ ctx }) => {
    const today = formatDate(new Date());
    return listPlannedItemsByUserAndDateRange(ctx.userIds, today, today);
  });

export const listWeekPlannedRecipesProcedure = authedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/calendar/week",
      protect: true,
      tags: ["Planned Recipes"],
      summary: "List recipes planned for the current week",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .output(z.array(PlannedItemWithRecipePayloadSchema))
  .query(async ({ ctx }) => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 6);

    return listPlannedItemsByUserAndDateRange(ctx.userIds, formatDate(start), formatDate(end));
  });

export const listMonthPlannedRecipesProcedure = authedProcedure
  .meta({
    openapi: {
      method: "GET",
      path: "/calendar/month",
      protect: true,
      tags: ["Planned Recipes"],
      summary: "List recipes planned for the current month",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .output(z.array(PlannedItemWithRecipePayloadSchema))
  .query(async ({ ctx }) => {
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);

    return listPlannedItemsByUserAndDateRange(ctx.userIds, formatDate(start), formatDate(end));
  });

export const moveItemProcedure = authedProcedure.input(PlannedItemMoveInputSchema).mutation(async ({ ctx, input }) => {
  const { itemId, version, targetDate, targetSlot, targetIndex } = input;
  const item = await getPlannedItemById(itemId);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Planned item not found" });
  await assertHouseholdAccess(ctx.user.id, item.userId);

  const outcome = await moveItem(itemId, targetDate, targetSlot, targetIndex, version);
  if (outcome.stale) {
    log.info({ userId: ctx.user.id, itemId, version }, "Ignoring stale moveItem mutation");
    return { success: true, stale: true };
  }

  const movedItem = outcome.value;
  const movedItemWithRecipe = await getPlannedItemWithRecipeById(movedItem.id);
  if (!movedItemWithRecipe) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to fetch moved item" });

  const targetSlotItems = await listPlannedItemsWithRecipeBySlot(ctx.userIds, targetDate, targetSlot);
  const targetSlotSortUpdates: SlotItemSortUpdate[] = targetSlotItems.map((i) => ({ id: i.id, sortOrder: i.sortOrder }));

  let sourceSlotSortUpdates: SlotItemSortUpdate[] | null = null;
  if (item.date !== targetDate || item.slot !== targetSlot) {
    const sourceSlotItems = await listPlannedItemsWithRecipeBySlot(ctx.userIds, item.date, item.slot);
    sourceSlotSortUpdates = sourceSlotItems.map((i) => ({ id: i.id, sortOrder: i.sortOrder }));
  }

  const itemPayload: PlannedItemWithRecipePayload = {
    id: movedItemWithRecipe.id,
    date: movedItemWithRecipe.date,
    slot: movedItemWithRecipe.slot,
    sortOrder: movedItemWithRecipe.sortOrder,
    itemType: movedItemWithRecipe.itemType,
    recipeId: movedItemWithRecipe.recipeId,
    title: movedItemWithRecipe.title,
    userId: movedItemWithRecipe.userId,
    version: movedItemWithRecipe.version,
    recipeName: movedItemWithRecipe.recipeName,
    recipeImage: movedItemWithRecipe.recipeImage,
    servings: movedItemWithRecipe.servings,
    calories: movedItemWithRecipe.calories,
  };

  calendarEmitter.emitToHousehold(ctx.householdKey, "itemMoved", {
    item: itemPayload,
    targetSlotItems: targetSlotSortUpdates,
    sourceSlotItems: sourceSlotSortUpdates,
    oldDate: item.date,
    oldSlot: item.slot,
    oldSortOrder: item.sortOrder,
  });

  return { success: true, stale: false, item: itemPayload };
});

export const createPlannedRecipeProcedure = authedProcedure
  .meta({
    openapi: {
      method: "POST",
      path: "/calendar",
      protect: true,
      tags: ["Planned Recipes"],
      summary: "Add a recipe to the meal plan",
      errorResponses: {
        401: "Unauthorized",
      },
    },
  })
  .input(createItemInput)
  .output(PlannedItemWithRecipePayloadSchema)
  .mutation(async ({ ctx, input }) => {
  const { date, slot, itemType, recipeId, title } = input;
  const newItem = await createPlannedItem({
    userId: ctx.user.id,
    date,
    slot,
    itemType,
    recipeId: recipeId ?? null,
    title: title ?? null,
  });

  const itemWithRecipe = await getPlannedItemWithRecipeById(newItem.id);
  const itemPayload: PlannedItemWithRecipePayload = {
    id: newItem.id,
    date: newItem.date,
    slot: newItem.slot,
    sortOrder: newItem.sortOrder,
    itemType: newItem.itemType,
    recipeId: newItem.recipeId,
    title: newItem.title,
    userId: newItem.userId,
    version: newItem.version,
    recipeName: itemWithRecipe?.recipeName ?? null,
    recipeImage: itemWithRecipe?.recipeImage ?? null,
    servings: itemWithRecipe?.servings ?? null,
    calories: itemWithRecipe?.calories ?? null,
  };

  calendarEmitter.emitToHousehold(ctx.householdKey, "itemCreated", { item: itemPayload });
  return itemPayload;
});

export const deletePlannedRecipeProcedure = authedProcedure
  .meta({
    openapi: {
      method: "DELETE",
      path: "/calendar/{itemId}",
      protect: true,
      tags: ["Planned Recipes"],
      summary: "Remove a recipe from the meal plan",
      errorResponses: {
        401: "Unauthorized",
        404: "Planned item not found",
      },
    },
  })
  .input(PlannedItemDeleteInputSchema)
  .output(z.object({ success: z.boolean(), stale: z.boolean() }))
  .mutation(async ({ ctx, input }) => {
  const { itemId, version } = input;
  const item = await getPlannedItemById(itemId);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Planned item not found" });
  await assertHouseholdAccess(ctx.user.id, item.userId);

  const outcome = await deletePlannedItem(itemId, version);
  if (outcome.stale) {
    log.info({ userId: ctx.user.id, itemId, version }, "Ignoring stale deleteItem mutation");
    return { success: true, stale: true };
  }

  calendarEmitter.emitToHousehold(ctx.householdKey, "itemDeleted", {
    itemId,
    date: item.date,
    slot: item.slot,
  });

  return { success: true, stale: false };
});

export const updateItemProcedure = authedProcedure.input(PlannedItemUpdateInputSchema).mutation(async ({ ctx, input }) => {
  const { itemId, title, version } = input;
  const item = await getPlannedItemById(itemId);
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Planned item not found" });
  await assertHouseholdAccess(ctx.user.id, item.userId);

  const outcome = await updatePlannedItem(itemId, { title }, version);
  if (outcome.stale) {
    log.info({ userId: ctx.user.id, itemId, version }, "Ignoring stale updateItem mutation");
    return { success: true, stale: true };
  }

  const updatedItem = outcome.value;
  const itemWithRecipe = await getPlannedItemWithRecipeById(updatedItem.id);
  if (!itemWithRecipe) throw new Error("Failed to fetch updated item");

  const itemPayload: PlannedItemWithRecipePayload = {
    id: itemWithRecipe.id,
    date: itemWithRecipe.date,
    slot: itemWithRecipe.slot,
    sortOrder: itemWithRecipe.sortOrder,
    itemType: itemWithRecipe.itemType,
    recipeId: itemWithRecipe.recipeId,
    title: itemWithRecipe.title,
    userId: itemWithRecipe.userId,
    version: itemWithRecipe.version,
    recipeName: itemWithRecipe.recipeName,
    recipeImage: itemWithRecipe.recipeImage,
    servings: itemWithRecipe.servings,
    calories: itemWithRecipe.calories,
  };

  calendarEmitter.emitToHousehold(ctx.householdKey, "itemUpdated", { item: itemPayload });
  return { success: true, stale: false, item: itemPayload };
});

export const plannedItemsProcedures = router({
  listItems: listItemsProcedure,
  moveItem: moveItemProcedure,
  createItem: createPlannedRecipeProcedure,
  deleteItem: deletePlannedRecipeProcedure,
  updateItem: updateItemProcedure,
});
