// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createRecipeWithRefs: vi.fn(),
  dashboardRecipe: vi.fn(),
  getAllergiesForUsers: vi.fn(),
  rateRecipe: vi.fn(),
  getAverageRating: vi.fn(),
  addAutoTaggingJob: vi.fn(),
  addAllergyDetectionJob: vi.fn(),
  emitByPolicy: vi.fn(),
  loggerMock: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("@norish/db", () => ({
  createRecipeWithRefs: mocked.createRecipeWithRefs,
  dashboardRecipe: mocked.dashboardRecipe,
  getAllergiesForUsers: mocked.getAllergiesForUsers,
}));

vi.mock("@norish/db/repositories/ratings", () => ({
  rateRecipe: mocked.rateRecipe,
  getAverageRating: mocked.getAverageRating,
}));

vi.mock("@norish/config/server-config-loader", () => ({
  getAIConfig: vi.fn().mockResolvedValue({ autoTagAllergies: false }),
  getRecipePermissionPolicy: vi.fn().mockResolvedValue({ view: "everyone" }),
  isAIEnabled: vi.fn().mockResolvedValue(true),
}));

vi.mock("@norish/queue/registry", () => ({
  getQueues: vi.fn(() => ({ autoTagging: {}, allergyDetection: {} })),
}));

vi.mock("@norish/queue/auto-tagging/producer", () => ({
  addAutoTaggingJob: mocked.addAutoTaggingJob,
}));

vi.mock("@norish/queue/allergy-detection/producer", () => ({
  addAllergyDetectionJob: mocked.addAllergyDetectionJob,
}));

vi.mock("@norish/trpc/helpers", () => ({
  emitByPolicy: mocked.emitByPolicy,
}));

vi.mock("@norish/trpc/routers/recipes/emitter", () => ({
  recipeEmitter: {},
}));

vi.mock("@norish/shared-server/logger", () => ({
  createLogger: vi.fn(() => mocked.loggerMock),
  serverLogger: mocked.loggerMock,
  dbLogger: mocked.loggerMock,
  authLogger: mocked.loggerMock,
  wsLogger: mocked.loggerMock,
  aiLogger: mocked.loggerMock,
  trpcLogger: mocked.loggerMock,
  schedulerLogger: mocked.loggerMock,
  videoLogger: mocked.loggerMock,
  parserLogger: mocked.loggerMock,
  redisLogger: mocked.loggerMock,
  redactUrl: vi.fn((url) => url),
  default: mocked.loggerMock,
}));

vi.mock("@norish/shared-server/media/storage", () => ({
  deleteRecipeImagesDir: vi.fn(),
}));

import { processPasteImportJob } from "../../src/paste-import/worker";

describe("processPasteImportJob", () => {
  it(
    "creates valid structured recipes in order and persists normalized ratings",
    async () => {
      mocked.createRecipeWithRefs.mockResolvedValueOnce("recipe-1").mockResolvedValueOnce("recipe-2");
      mocked.dashboardRecipe
        .mockResolvedValueOnce({ id: "recipe-1", name: "First" })
        .mockResolvedValueOnce({ id: "recipe-2", name: "Second" });
      mocked.getAverageRating.mockResolvedValue({ averageRating: 5, ratingCount: 1 });

      const result = await processPasteImportJob({
        id: "job-1",
        attemptsMade: 0,
        opts: {},
        data: {
          batchId: "batch-1",
          recipeIds: ["recipe-1", "recipe-invalid", "recipe-2"],
          userId: "user-1",
          householdKey: "household-1",
          householdUserIds: null,
          text: "structured",
          structuredRecipes: [
            {
              recipeId: "recipe-1",
              importedRating: 4.6,
              recipe: {
                name: "First",
                description: null,
                notes: null,
                url: null,
                image: null,
                servings: 1,
                prepMinutes: null,
                cookMinutes: null,
                totalMinutes: null,
                calories: null,
                fat: null,
                carbs: null,
                protein: null,
                systemUsed: "metric",
                recipeIngredients: [
                  {
                    ingredientId: null,
                    ingredientName: "Egg",
                    amount: 1,
                    unit: null,
                    systemUsed: "metric",
                    order: 0,
                  },
                ],
                steps: [{ step: "Mix", order: 1, systemUsed: "metric" }],
                tags: [],
                categories: [],
                images: [],
                videos: [],
              },
            },
            {
              recipeId: "recipe-invalid",
              importedRating: null,
              recipe: {
                name: "Invalid",
                description: null,
                notes: null,
                url: null,
                image: null,
                servings: 1,
                prepMinutes: null,
                cookMinutes: null,
                totalMinutes: null,
                calories: null,
                fat: null,
                carbs: null,
                protein: null,
                systemUsed: "metric",
                recipeIngredients: [],
                steps: [],
                tags: [],
                categories: [],
                images: [],
                videos: [],
              },
            },
            {
              recipeId: "recipe-2",
              importedRating: 9.2,
              recipe: {
                name: "Second",
                description: null,
                notes: null,
                url: null,
                image: null,
                servings: 1,
                prepMinutes: null,
                cookMinutes: null,
                totalMinutes: null,
                calories: null,
                fat: null,
                carbs: null,
                protein: null,
                systemUsed: "metric",
                recipeIngredients: [
                  {
                    ingredientId: null,
                    ingredientName: "Milk",
                    amount: 1,
                    unit: null,
                    systemUsed: "metric",
                    order: 0,
                  },
                ],
                steps: [{ step: "Cook", order: 1, systemUsed: "metric" }],
                tags: [],
                categories: [],
                images: [],
                videos: [],
              },
            },
          ],
        },
      } as any);

      expect(result).toEqual({ recipeIds: ["recipe-1", "recipe-2"] });
      expect(mocked.createRecipeWithRefs).toHaveBeenCalledTimes(2);
      expect(mocked.rateRecipe).toHaveBeenNthCalledWith(1, "user-1", "recipe-1", 5);
      expect(mocked.rateRecipe).toHaveBeenNthCalledWith(2, "user-1", "recipe-2", 5);
      expect(mocked.addAutoTaggingJob).toHaveBeenCalledTimes(2);
      expect(mocked.addAllergyDetectionJob).toHaveBeenCalledTimes(2);
    },
    15000
  );

  it(
    "fails when no valid structured items remain",
    async () => {
      await expect(
        processPasteImportJob({
          id: "job-2",
          attemptsMade: 0,
          opts: {},
          data: {
            batchId: "batch-2",
            recipeIds: ["recipe-invalid"],
            userId: "user-1",
            householdKey: "household-1",
            householdUserIds: null,
            text: "structured",
            structuredRecipes: [
              {
                recipeId: "recipe-invalid",
                importedRating: null,
                recipe: {
                  name: "Invalid",
                  description: null,
                  notes: null,
                  url: null,
                  image: null,
                  servings: 1,
                  prepMinutes: null,
                  cookMinutes: null,
                  totalMinutes: null,
                  calories: null,
                  fat: null,
                  carbs: null,
                  protein: null,
                  systemUsed: "metric",
                  recipeIngredients: [],
                  steps: [],
                  tags: [],
                  categories: [],
                  images: [],
                  videos: [],
                },
              },
            ],
          },
        } as any)
      ).rejects.toThrow("No valid recipes found in structured paste input.");
    },
    15000
  );
});
