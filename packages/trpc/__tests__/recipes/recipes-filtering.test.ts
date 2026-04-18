// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { appRouter } from "../../src/router";
import { listRecipes } from "../mocks/recipes-repository";
import {
  createMockAuthedContext,
  createMockHousehold,
  createMockUser,
} from "./test-utils";

// Mock the repository
vi.mock("@norish/db/repositories/recipes", () => import("../mocks/recipes-repository"));
vi.mock("@norish/auth/permissions", () => import("../mocks/permissions"));
vi.mock("@norish/config/server-config-loader", () => import("../mocks/config"));

describe("recipes filtering tRPC", () => {
  const mockUser = createMockUser();
  const mockHousehold = createMockHousehold();
  let ctx: any;

  beforeEach(() => {
    vi.clearAllMocks();
    ctx = createMockAuthedContext(mockUser, mockHousehold);
  });

  it("passes excludedTags to the repository in list procedure", async () => {
    listRecipes.mockResolvedValue({
      recipes: [],
      total: 0,
    });

    const caller = appRouter.createCaller(ctx);
    
    await caller.recipes.list({
      limit: 10,
      cursor: 0,
      excludedTags: ["Allergen: Gluten", "Allergen: Huevo"],
      tags: ["Cuisine: Italiana"],
    });

    expect(listRecipes).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: mockUser.id,
      }),
      10,
      0,
      undefined,
      expect.any(Array),
      ["Cuisine: Italiana"],
      "OR",
      "dateDesc",
      undefined,
      undefined,
      undefined,
      ["Allergen: Gluten", "Allergen: Huevo"]
    );
  });
});
