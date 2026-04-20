// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createRecipeWithRefs: vi.fn(),
  dashboardRecipe: vi.fn(),
  getAllergiesForUsers: vi.fn(),
  addRecipeImages: vi.fn(),
  emitByPolicy: vi.fn(),
  extractRecipeFromImages: vi.fn(),
  saveImageBytes: vi.fn(),
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
  addRecipeImages: mocked.addRecipeImages,
  createRecipeWithRefs: mocked.createRecipeWithRefs,
  dashboardRecipe: mocked.dashboardRecipe,
  getAllergiesForUsers: mocked.getAllergiesForUsers,
}));

vi.mock("@norish/config/server-config-loader", () => ({
  getAIConfig: vi.fn().mockResolvedValue({ autoTagAllergies: false }),
  getRecipePermissionPolicy: vi.fn().mockResolvedValue({ view: "everyone" }),
}));

vi.mock("@norish/queue/api-handlers", () => ({
  requireQueueApiHandler: vi.fn(() => mocked.extractRecipeFromImages),
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
  saveImageBytes: mocked.saveImageBytes,
}));

import { processImageImportJob } from "../../src/image-import/worker";

describe("processImageImportJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocked.extractRecipeFromImages.mockResolvedValue({
      success: true,
      data: {
        id: "recipe-123",
        name: "Extracted Recipe",
        description: null,
        notes: null,
        url: null,
        image: null,
        servings: 2,
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
            ingredientName: "Flour",
            amount: 1,
            unit: "cup",
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
    });
    mocked.createRecipeWithRefs.mockResolvedValue("recipe-123");
    mocked.dashboardRecipe.mockResolvedValue({ id: "recipe-123", name: "Extracted Recipe" });
    mocked.saveImageBytes.mockResolvedValue("/recipes/recipe-123/uploaded.jpg");
  });

  it(
    "passes the job recipeId through extraction and image persistence",
    async () => {
      await processImageImportJob({
        id: "job-1",
        attemptsMade: 0,
        opts: {},
        data: {
          recipeId: "recipe-123",
          userId: "user-1",
          householdKey: "household-1",
          householdUserIds: null,
          files: [
            {
              data: Buffer.from("img").toString("base64"),
              mimeType: "image/jpeg",
              filename: "recipe.jpg",
            },
          ],
        },
      } as any);

      expect(mocked.extractRecipeFromImages).toHaveBeenCalledWith(
        "recipe-123",
        expect.any(Array),
        undefined
      );
      expect(mocked.createRecipeWithRefs).toHaveBeenCalledWith(
        "recipe-123",
        "user-1",
        expect.objectContaining({ id: "recipe-123", name: "Extracted Recipe" })
      );
      expect(mocked.saveImageBytes).toHaveBeenCalledWith(expect.any(Buffer), "recipe-123");
      expect(mocked.addRecipeImages).toHaveBeenCalledWith("recipe-123", [
        { image: "/recipes/recipe-123/uploaded.jpg", order: 0 },
      ]);
    },
    15000
  );
});
