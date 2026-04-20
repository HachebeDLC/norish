/**
 * Mock for @norish/db
 */
import { vi } from "vitest";
import { z } from "zod";

export const listGroceriesByUsers = vi.fn();
export const createGroceries = vi.fn();
export const updateGroceries = vi.fn();
export const deleteGroceryByIds = vi.fn();
export const deleteDoneInStore = vi.fn();
export const deleteDoneGroceriesBefore = vi.fn();
export const getGroceryOwnerIds = vi.fn();
export const getGroceriesByIds = vi.fn();
export const getRecipeInfoForGroceries = vi.fn();
export const createGrocery = vi.fn();
export const assignGroceryToStore = vi.fn();
export const reorderGroceriesInStore = vi.fn();
export const markAllDoneInStore = vi.fn();
export const updateGrocery = vi.fn();

export const GroceryCreateSchema = z.object({
  name: z.string().nullish(),
  amount: z.number().nullish(),
  unit: z.string().nullish(),
  isDone: z.boolean().nullish(),
  storeId: z.string().nullish(),
  recipeIngredientId: z.string().nullish(),
  recurringGroceryId: z.string().nullish(),
});

export const GroceryUpdateBaseSchema = z.object({}).passthrough();

export const GroceryUpdateInputSchema = z.object({
  groceryId: z.string().uuid(),
  raw: z.string(),
  version: z.number(),
});

export const GroceryToggleSchema = z.object({
  groceries: z.array(z.object({ id: z.string().uuid(), version: z.number() })),
  isDone: z.boolean(),
});

export const GroceryDeleteSchema = z.object({
  groceries: z.array(z.object({ id: z.string().uuid(), version: z.number() })),
});

export const GrocerySelectBaseSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullish(),
  isDone: z.boolean(),
  version: z.number(),
}).passthrough();

export const AssignGroceryToStoreInputSchema = z.object({
  groceryId: z.string().uuid(),
  storeId: z.string().uuid().nullable(),
  version: z.number(),
  savePreference: z.boolean().optional(),
});

export const DeleteDoneGroceriesInputSchema = z.object({
  storeId: z.string().uuid().nullable(),
  groceries: z.array(z.object({ id: z.string().uuid(), version: z.number() })).optional(),
});

export const MarkAllDoneGroceriesInputSchema = z.object({
  storeId: z.string().uuid().nullable(),
  groceries: z.array(z.object({ id: z.string().uuid(), version: z.number() })).optional(),
});

export const ReorderGroceriesInStoreInputSchema = z.object({
  updates: z.array(z.object({ id: z.string().uuid(), sortOrder: z.number(), storeId: z.string().uuid().nullish() })),
  savePreference: z.boolean().optional(),
});

export function resetDbMocks() {
  listGroceriesByUsers.mockReset();
  createGroceries.mockReset();
  updateGroceries.mockReset();
  deleteGroceryByIds.mockReset();
  deleteDoneInStore.mockReset();
  deleteDoneGroceriesBefore.mockReset();
  getGroceryOwnerIds.mockReset();
  getGroceriesByIds.mockReset();
  getRecipeInfoForGroceries.mockReset();
  createGrocery.mockReset();
  assignGroceryToStore.mockReset();
  reorderGroceriesInStore.mockReset();
  markAllDoneInStore.mockReset();
  updateGrocery.mockReset();
}
