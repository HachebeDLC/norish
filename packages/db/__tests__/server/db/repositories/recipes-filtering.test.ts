// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { listRecipes } from "@norish/db/repositories/recipes";
import { getTestDb } from "../../../helpers/db-test-helpers";
import { RepositoryTestBase } from "../../../helpers/repository-test-base";
import * as schema from "@norish/db/schema";

describe("Recipe Repository - listRecipes Filtering", () => {
  let testUserId: string;
  const testBase = new RepositoryTestBase("test_recipes_filtering");

  beforeAll(async () => {
    await testBase.setup();
  });

  beforeEach(async () => {
    const [user] = await testBase.beforeEachTest();
    testUserId = user.id;
  });

  afterAll(async () => {
    await testBase.teardown();
  });

  async function createTag(name: string, category: string = "dietary") {
    const db = getTestDb();
    const [tag] = await db
      .insert(schema.tags)
      .values({ name, category })
      .onConflictDoNothing()
      .returning();
    
    if (tag) return tag;
    
    const [existing] = await db
      .select()
      .from(schema.tags)
      .where(testBase.db.execute(schema.sql`LOWER(${schema.tags.name}) = ${name.toLowerCase()}`));
    return existing;
  }

  async function attachTag(recipeId: string, tagId: string) {
    const db = getTestDb();
    await db.insert(schema.recipeTags).values({ recipeId, tagId }).onConflictDoNothing();
  }

  it("should filter by tag inclusion (OR mode)", async () => {
    const db = getTestDb();
    const tagItalian = await createTag("Cuisine: Italiana", "cuisine");
    const tagSpanish = await createTag("Cuisine: Española", "cuisine");

    const [r1] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Pasta" }).returning();
    const [r2] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Paella" }).returning();
    const [r3] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Burger" }).returning();

    await attachTag(r1.id, tagItalian.id);
    await attachTag(r2.id, tagSpanish.id);

    const ctx = { userId: testUserId, householdUserIds: null, isServerAdmin: false };
    
    // Search for Italian OR Spanish
    const result = await listRecipes(ctx, 10, 0, undefined, [], ["Cuisine: Italiana", "Cuisine: Española"], "OR");
    
    expect(result.total).toBe(2);
    const names = result.recipes.map(r => r.name);
    expect(names).toContain("Pasta");
    expect(names).toContain("Paella");
    expect(names).not.toContain("Burger");
  });

  it("should filter by tag inclusion (AND mode)", async () => {
    const db = getTestDb();
    const tagVegan = await createTag("vegan", "dietary");
    const tagEasy = await createTag("Difficulty: Easy", "difficulty");

    const [r1] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Vegan Easy Salad" }).returning();
    const [r2] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Vegan Complex Roast" }).returning();

    await attachTag(r1.id, tagVegan.id);
    await attachTag(r1.id, tagEasy.id);
    await attachTag(r2.id, tagVegan.id);

    const ctx = { userId: testUserId, householdUserIds: null, isServerAdmin: false };
    
    // Search for Vegan AND Easy
    const result = await listRecipes(ctx, 10, 0, undefined, [], ["vegan", "Difficulty: Easy"], "AND");
    
    expect(result.total).toBe(1);
    expect(result.recipes[0].name).toBe("Vegan Easy Salad");
  });

  it("should exclude recipes by excludedTagNames", async () => {
    const db = getTestDb();
    const tagGluten = await createTag("Allergen: Gluten", "allergen");
    const tagItalian = await createTag("Cuisine: Italiana", "cuisine");

    const [r1] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Gluten Pasta" }).returning();
    const [r2] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Gluten-Free Risotto" }).returning();

    await attachTag(r1.id, tagGluten.id);
    await attachTag(r1.id, tagItalian.id);
    await attachTag(r2.id, tagItalian.id);

    const ctx = { userId: testUserId, householdUserIds: null, isServerAdmin: false };
    
    // Search for Italian BUT EXCLUDE Gluten
    const result = await listRecipes(
      ctx, 10, 0, 
      undefined, [], 
      ["Cuisine: Italiana"], 
      "OR", "dateDesc", 
      undefined, undefined, 
      undefined, 
      ["Allergen: Gluten"]
    );
    
    expect(result.total).toBe(1);
    expect(result.recipes[0].name).toBe("Gluten-Free Risotto");
  });

  it("should handle mixed inclusion and exclusion", async () => {
    const db = getTestDb();
    const tagVegan = await createTag("vegan", "dietary");
    const tagNuts = await createTag("Allergen: Frutos secos", "allergen");

    const [r1] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Vegan Nut Salad" }).returning();
    const [r2] = await db.insert(schema.recipes).values({ userId: testUserId, name: "Vegan Fruit Salad" }).returning();

    await attachTag(r1.id, tagVegan.id);
    await attachTag(r1.id, tagNuts.id);
    await attachTag(r2.id, tagVegan.id);

    const ctx = { userId: testUserId, householdUserIds: null, isServerAdmin: false };
    
    // Vegan recipes WITHOUT Nuts
    const result = await listRecipes(
      ctx, 10, 0, 
      undefined, [], 
      ["vegan"], 
      "OR", "dateDesc", 
      undefined, undefined, 
      undefined, 
      ["Allergen: Frutos secos"]
    );
    
    expect(result.total).toBe(1);
    expect(result.recipes[0].name).toBe("Vegan Fruit Salad");
  });
});
