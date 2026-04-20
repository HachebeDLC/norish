// @vitest-environment node
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlannedRecipeProcedure,
  deletePlannedRecipeProcedure,
  listMonthPlannedRecipesProcedure,
  listTodayPlannedRecipesProcedure,
  listWeekPlannedRecipesProcedure,
  moveItemProcedure,
  updateItemProcedure,
} from "../../src/routers/calendar/planned-items";
import { router } from "../../src/trpc";
import { assertHouseholdAccess } from "../mocks/permissions";
import {
  createPlannedItem,
  deletePlannedItem,
  getPlannedItemById,
  getPlannedItemOwnerId,
  getPlannedItemWithRecipeById,
  listPlannedItemsByUserAndDateRange,
  listPlannedItemsWithRecipeBySlot,
  moveItem,
} from "../mocks/planned-items";
import { createMockAuthedContext, createMockHousehold, createMockUser } from "./test-utils";

vi.mock("@norish/db/repositories/planned-items", () => import("../mocks/planned-items"));
vi.mock("@norish/auth/permissions", () => import("../mocks/permissions"));
vi.mock("@norish/queue", () => import("../mocks/calendar-emitter"));
vi.mock("@norish/config/server-config-loader", () => import("../mocks/config"));

const t = initTRPC.context<ReturnType<typeof createMockAuthedContext>>().create({
  transformer: superjson,
});

function createMockPlannedItem(overrides: Record<string, unknown> = {}) {
  return {
    id: `item-${crypto.randomUUID()}`,
    userId: "test-user-id",
    date: "2025-01-15",
    slot: "Breakfast" as const,
    sortOrder: 0,
    itemType: "recipe" as const,
    recipeId: "recipe-1",
    title: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const plannedItemsRouter = router({
  moveItem: moveItemProcedure,
  createItem: createPlannedRecipeProcedure,
  deleteItem: deletePlannedRecipeProcedure,
  updateItem: updateItemProcedure,
});

const openApiCalendarRouter = router({
  listTodayPlannedRecipes: listTodayPlannedRecipesProcedure,
  listWeekPlannedRecipes: listWeekPlannedRecipesProcedure,
  listMonthPlannedRecipes: listMonthPlannedRecipesProcedure,
  createPlannedRecipe: createPlannedRecipeProcedure,
  deletePlannedRecipe: deletePlannedRecipeProcedure,
});

describe("calendar planned recipe openapi procedures", () => {
  const mockUser = createMockUser();
  const mockHousehold = createMockHousehold();
  let ctx: ReturnType<typeof createMockAuthedContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-15T12:00:00"));
    ctx = createMockAuthedContext(mockUser, mockHousehold);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists today's planned recipes only", async () => {
    listPlannedItemsByUserAndDateRange.mockResolvedValue([
      {
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 0,
        itemType: "recipe",
        recipeId: crypto.randomUUID(),
        title: null,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        recipeName: "Omelette",
        recipeImage: null,
        servings: 2,
        calories: 250,
      },
      {
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        date: "2025-01-15",
        slot: "Lunch",
        sortOrder: 0,
        itemType: "note",
        recipeId: null,
        title: "Leftovers",
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        recipeName: null,
        recipeImage: null,
        servings: null,
        calories: null,
      },
    ]);

    const caller = openApiCalendarRouter.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.listTodayPlannedRecipes();

    const today = new Date().toISOString().split("T")[0];
    expect(listPlannedItemsByUserAndDateRange).toHaveBeenCalledWith(
      ctx.userIds,
      today,
      today
    );
    expect(result).toEqual([
      {
        id: expect.any(String),
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 0,
        itemType: "recipe",
        recipeId: expect.any(String),
        title: null,
        userId: ctx.user.id,
        version: 1,
        recipeName: "Omelette",
        recipeImage: null,
        servings: 2,
        calories: 250,
      },
      {
        id: expect.any(String),
        date: "2025-01-15",
        slot: "Lunch",
        sortOrder: 0,
        itemType: "note",
        recipeId: null,
        title: "Leftovers",
        userId: ctx.user.id,
        version: 1,
        recipeName: null,
        recipeImage: null,
        servings: null,
        calories: null,
      },
    ]);
  });

  it("lists the current week's planned recipes using server time", async () => {
    listPlannedItemsByUserAndDateRange.mockResolvedValue([]);

    const caller = openApiCalendarRouter.createCaller({ ...ctx, multiplexer: null } as any);
    await caller.listWeekPlannedRecipes();

    const start = new Date().toISOString().split("T")[0];
    const end = new Date();
    end.setDate(end.getDate() + 6);
    const endISO = end.toISOString().split("T")[0];

    expect(listPlannedItemsByUserAndDateRange).toHaveBeenCalledWith(
      ctx.userIds,
      start,
      endISO
    );
  });

  it("lists the current month's planned recipes using server time", async () => {
    listPlannedItemsByUserAndDateRange.mockResolvedValue([]);

    const caller = openApiCalendarRouter.createCaller({ ...ctx, multiplexer: null } as any);
    await caller.listMonthPlannedRecipes();

    const start = new Date().toISOString().split("T")[0];
    const end = new Date();
    end.setMonth(end.getMonth() + 1);
    end.setDate(0);
    const endISO = end.toISOString().split("T")[0];

    expect(listPlannedItemsByUserAndDateRange).toHaveBeenCalledWith(
      ctx.userIds,
      start,
      endISO
    );
  });

  it("creates a planned recipe item", async () => {
    const itemId = crypto.randomUUID();
    const recipeId = crypto.randomUUID();

    createPlannedItem.mockResolvedValue({
      id: itemId,
      userId: ctx.user.id,
      date: "2025-01-20",
      slot: "Dinner",
      sortOrder: 0,
      itemType: "recipe",
      recipeId,
      title: null,
      version: 1,
    });
    getPlannedItemWithRecipeById.mockResolvedValue({
      id: itemId,
      userId: ctx.user.id,
      date: "2025-01-20",
      slot: "Dinner",
      sortOrder: 0,
      itemType: "recipe",
      recipeId,
      title: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      recipeName: "Pasta",
      recipeImage: null,
      servings: 4,
      calories: 600,
    });

    const caller = openApiCalendarRouter.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.createPlannedRecipe({
      date: "2025-01-20",
      slot: "Dinner",
      recipeId,
    });

    expect(createPlannedItem).toHaveBeenCalledWith({
      userId: ctx.user.id,
      date: "2025-01-20",
      slot: "Dinner",
      itemType: "recipe",
      recipeId,
      title: null,
    });
    expect(result).toEqual({
      id: itemId,
      date: "2025-01-20",
      slot: "Dinner",
      sortOrder: 0,
      itemType: "recipe",
      recipeId,
      title: null,
      userId: ctx.user.id,
      version: 1,
      recipeName: "Pasta",
      recipeImage: null,
      servings: 4,
      calories: 600,
    });
  });

  it("deletes a planned recipe item", async () => {
    const itemId = crypto.randomUUID();

    getPlannedItemById.mockResolvedValue({
      id: itemId,
      userId: ctx.user.id,
      date: "2025-01-20",
      slot: "Dinner",
      sortOrder: 0,
      itemType: "recipe",
      recipeId: crypto.randomUUID(),
      title: null,
      version: 2,
    });
    deletePlannedItem.mockResolvedValue({ stale: false, value: {} });
    assertHouseholdAccess.mockResolvedValue(undefined);

    const caller = openApiCalendarRouter.createCaller({ ...ctx, multiplexer: null } as any);
    const result = await caller.deletePlannedRecipe({ itemId, version: 2 });

    expect(result).toEqual({ success: true, stale: false });
  });
});

describe("calendar planned items procedures", () => {
  const mockUser = createMockUser();
  const mockHousehold = createMockHousehold();
  let ctx: ReturnType<typeof createMockAuthedContext>;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockAuthedContext(mockUser, mockHousehold);
  });

  describe("moveItem", () => {
    it("moves item within same slot (reorder)", async () => {
      const mockItem = createMockPlannedItem({
        id: crypto.randomUUID(),
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 0,
      });

      const movedItem = createMockPlannedItem({
        ...mockItem,
        sortOrder: 2,
        version: 2,
      });

      getPlannedItemById.mockResolvedValue(mockItem);
      assertHouseholdAccess.mockResolvedValue(undefined);
      moveItem.mockResolvedValue({ stale: false, value: movedItem });
      getPlannedItemWithRecipeById.mockResolvedValue({
        ...movedItem,
        recipeName: "Omelette",
        recipeImage: null,
        servings: 2,
        calories: 250,
      });
      listPlannedItemsWithRecipeBySlot.mockResolvedValue([]);

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);
      const result = await caller.moveItem({
        itemId: mockItem.id,
        version: 1,
        targetDate: "2025-01-15",
        targetSlot: "Breakfast",
        targetIndex: 2,
      });

      expect(getPlannedItemById).toHaveBeenCalledWith(mockItem.id);
      expect(assertHouseholdAccess).toHaveBeenCalledWith(ctx.user.id, mockItem.userId);
      expect(moveItem).toHaveBeenCalledWith(mockItem.id, "2025-01-15", "Breakfast", 2, 1);
      expect(result).toEqual({
        success: true,
        stale: false,
        item: expect.objectContaining({
          id: mockItem.id,
          sortOrder: 2,
          version: 2,
        }),
      });
    });

    it("moves item to different slot same day", async () => {
      const mockItem = createMockPlannedItem({
        id: crypto.randomUUID(),
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 0,
      });

      const movedItem = createMockPlannedItem({
        ...mockItem,
        slot: "Dinner",
        sortOrder: 0,
        version: 2,
      });

      getPlannedItemById.mockResolvedValue(mockItem);
      assertHouseholdAccess.mockResolvedValue(undefined);
      moveItem.mockResolvedValue({ stale: false, value: movedItem });
      getPlannedItemWithRecipeById.mockResolvedValue({
        ...movedItem,
        recipeName: "Omelette",
        recipeImage: null,
        servings: 2,
        calories: 250,
      });
      listPlannedItemsWithRecipeBySlot.mockResolvedValue([]);

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);
      const result = await caller.moveItem({
        itemId: mockItem.id,
        version: 1,
        targetDate: "2025-01-15",
        targetSlot: "Dinner",
        targetIndex: 0,
      });

      expect(moveItem).toHaveBeenCalledWith(mockItem.id, "2025-01-15", "Dinner", 0, 1);
      expect(result.success).toBe(true);
    });

    it("moves item to different day", async () => {
      const mockItem = createMockPlannedItem({
        id: crypto.randomUUID(),
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 0,
      });

      const movedItem = createMockPlannedItem({
        ...mockItem,
        date: "2025-01-20",
        slot: "Lunch",
        sortOrder: 1,
        version: 2,
      });

      getPlannedItemById.mockResolvedValue(mockItem);
      assertHouseholdAccess.mockResolvedValue(undefined);
      moveItem.mockResolvedValue({ stale: false, value: movedItem });
      getPlannedItemWithRecipeById.mockResolvedValue({
        ...movedItem,
        recipeName: "Omelette",
        recipeImage: null,
        servings: 2,
        calories: 250,
      });
      listPlannedItemsWithRecipeBySlot.mockResolvedValue([]);

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);
      const result = await caller.moveItem({
        itemId: mockItem.id,
        version: 1,
        targetDate: "2025-01-20",
        targetSlot: "Lunch",
        targetIndex: 1,
      });

      expect(moveItem).toHaveBeenCalledWith(mockItem.id, "2025-01-20", "Lunch", 1, 1);
      expect(result.success).toBe(true);
    });

    it("returns stale result when version mismatch", async () => {
      const itemId = crypto.randomUUID();
      const mockItem = createMockPlannedItem({
        id: itemId,
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 2,
        version: 2,
      });

      getPlannedItemById.mockResolvedValue(mockItem);
      assertHouseholdAccess.mockResolvedValue(undefined);
      moveItem.mockResolvedValue({ stale: true });

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);
      const result = await caller.moveItem({
        itemId,
        version: 1,
        targetDate: "2025-01-15",
        targetSlot: "Breakfast",
        targetIndex: 2,
      });

      expect(result).toEqual({ success: true, stale: true });
    });

    it("throws error when item not found", async () => {
      getPlannedItemById.mockResolvedValue(null);

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);

      await expect(
        caller.moveItem({
          itemId: crypto.randomUUID(),
          version: 1,
          targetDate: "2025-01-15",
          targetSlot: "Breakfast",
          targetIndex: 0,
        })
      ).rejects.toThrow("Planned item not found");

      expect(moveItem).not.toHaveBeenCalled();
    });

    it("throws error when user lacks permission", async () => {
      const mockItem = createMockPlannedItem({
        id: crypto.randomUUID(),
        userId: "other-user-id",
      });

      getPlannedItemById.mockResolvedValue(mockItem);
      assertHouseholdAccess.mockRejectedValue(new Error("Access denied"));

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);

      await expect(
        caller.moveItem({
          itemId: mockItem.id,
          version: 1,
          targetDate: "2025-01-15",
          targetSlot: "Breakfast",
          targetIndex: 0,
        })
      ).rejects.toThrow("Access denied");

      expect(moveItem).not.toHaveBeenCalled();
    });
  });

  describe("createItem", () => {
    it("creates a recipe item at end of slot", async () => {
      const itemId = crypto.randomUUID();
      const recipeId = crypto.randomUUID();
      const newItem = createMockPlannedItem({
        id: itemId,
        itemType: "recipe",
        recipeId,
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 0,
      });

      createPlannedItem.mockResolvedValue(newItem);
      getPlannedItemWithRecipeById.mockResolvedValue({
        ...newItem,
        recipeName: "Test Recipe",
        recipeImage: null,
        servings: 1,
        calories: 100,
      });

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);
      const result = await caller.createItem({
        date: "2025-01-15",
        slot: "Breakfast",
        itemType: "recipe",
        recipeId,
      });

      expect(createPlannedItem).toHaveBeenCalledWith({
        userId: ctx.user.id,
        date: "2025-01-15",
        slot: "Breakfast",
        itemType: "recipe",
        recipeId,
        title: null,
      });
      expect(result).toEqual({
        id: itemId,
        date: "2025-01-15",
        slot: "Breakfast",
        sortOrder: 0,
        itemType: "recipe",
        recipeId,
        title: null,
        userId: ctx.user.id,
        version: 1,
        recipeName: "Test Recipe",
        recipeImage: null,
        servings: 1,
        calories: 100,
      });
    });

    it("creates a note item at end of slot", async () => {
      const itemId = crypto.randomUUID();
      const newItem = createMockPlannedItem({
        id: itemId,
        itemType: "note",
        recipeId: null,
        title: "My Note",
        date: "2025-01-15",
        slot: "Lunch",
        sortOrder: 0,
        userId: ctx.user.id,
      });

      createPlannedItem.mockResolvedValue(newItem);
      getPlannedItemWithRecipeById.mockResolvedValue({
        ...newItem,
        recipeName: null,
        recipeImage: null,
        servings: null,
        calories: null,
      });

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);
      const result = await caller.createItem({
        date: "2025-01-15",
        slot: "Lunch",
        itemType: "note",
        title: "My Note",
      });

      expect(createPlannedItem).toHaveBeenCalledWith({
        userId: ctx.user.id,
        date: "2025-01-15",
        slot: "Lunch",
        itemType: "note",
        recipeId: null,
        title: "My Note",
      });
      expect(result).toEqual({
        id: itemId,
        date: "2025-01-15",
        slot: "Lunch",
        sortOrder: 0,
        itemType: "note",
        recipeId: null,
        title: "My Note",
        userId: ctx.user.id,
        version: 1,
        recipeName: null,
        recipeImage: null,
        servings: null,
        calories: null,
      });
    });

    it("throws error when recipe item missing recipeId", async () => {
      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);

      await expect(
        caller.createItem({
          date: "2025-01-15",
          slot: "Breakfast",
          itemType: "recipe",
        } as any)
      ).rejects.toThrow();

      expect(createPlannedItem).not.toHaveBeenCalled();
    });
  });

  describe("deleteItem", () => {
    it("deletes item", async () => {
      const itemId = crypto.randomUUID();
      getPlannedItemById.mockResolvedValue({
        id: itemId,
        userId: "test-user-id",
        date: "2025-01-15",
        slot: "Breakfast",
      });
      assertHouseholdAccess.mockResolvedValue(undefined);
      deletePlannedItem.mockResolvedValue({ stale: false, value: {} });

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);
      const result = await caller.deleteItem({ itemId, version: 1 });

      expect(getPlannedItemById).toHaveBeenCalledWith(itemId);
      expect(assertHouseholdAccess).toHaveBeenCalledWith(ctx.user.id, "test-user-id");
      expect(deletePlannedItem).toHaveBeenCalledWith(itemId, 1);
      expect(result).toEqual({ success: true, stale: false });
    });

    it("throws error when item not found", async () => {
      getPlannedItemById.mockResolvedValue(null);

      const caller = plannedItemsRouter.createCaller({ ...ctx, multiplexer: null } as any);

      await expect(caller.deleteItem({ itemId: crypto.randomUUID(), version: 1 })).rejects.toThrow(
        "Planned item not found"
      );

      expect(deletePlannedItem).not.toHaveBeenCalled();
    });
  });
});
