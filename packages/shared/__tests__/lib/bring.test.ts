import { describe, expect, it } from "vitest";
import {
  generateBringDeeplink,
  generateBringAppUrl,
  generateBringWebUrl,
} from "../../src/lib/bring";

describe("Bring! Integration Logic", () => {
  describe("generateBringDeeplink", () => {
    it("generates a correct deeplink URL with required params", () => {
      const url = generateBringDeeplink("https://norish.app/recipes/123");

      expect(url).toContain(
        "https://api.getbring.com/rest/bringrecipes/deeplink"
      );
      expect(url).toContain("source=web");

      const urlObj = new URL(url);
      expect(urlObj.searchParams.get("url")).toBe(
        "https://norish.app/recipes/123"
      );
      expect(urlObj.searchParams.get("baseQuantity")).toBe("4");
      expect(urlObj.searchParams.get("requestedQuantity")).toBe("4");
    });

    it("passes custom serving quantities through", () => {
      const url = generateBringDeeplink(
        "https://norish.app/recipes/123",
        2,
        6
      );

      const urlObj = new URL(url);
      expect(urlObj.searchParams.get("baseQuantity")).toBe("2");
      expect(urlObj.searchParams.get("requestedQuantity")).toBe("6");
    });

    it("URL-encodes the recipe URL", () => {
      const recipeUrl =
        "https://norish.app/recipes/my recipe?tab=ingredients";
      const url = generateBringDeeplink(recipeUrl);

      // The outer URL must be valid and parseable
      expect(() => new URL(url)).not.toThrow();

      // The recipe URL must be recoverable
      const urlObj = new URL(url);
      expect(urlObj.searchParams.get("url")).toBe(recipeUrl);
    });
  });

  describe("generateBringAppUrl", () => {
    const items = [
      { itemId: "Milk", spec: "1 liter" },
      { itemId: "Eggs", spec: "6 pieces" },
    ];

    it("generates a correct App-to-App deep link", () => {
      const url = generateBringAppUrl(items);

      expect(url).toContain("bringimport://import");
      expect(url).toContain("source=Norish");

      // Manually parse the custom URL scheme
      const queryString = url.split("?")[1];
      const params = new URLSearchParams(queryString);
      const itemsParam = params.get("items");

      expect(itemsParam).toBeDefined();
      const parsedItems = JSON.parse(itemsParam!);
      expect(parsedItems).toEqual(items);
    });

    it("handles special characters in item names", () => {
      const complexItems = [{ itemId: "Chili-Flocken", spec: "1 Prise" }];
      const url = generateBringAppUrl(complexItems);

      const queryString = url.split("?")[1];
      const params = new URLSearchParams(queryString);
      const parsedItems = JSON.parse(params.get("items")!);

      expect(parsedItems[0].itemId).toBe("Chili-Flocken");
    });
  });

  describe("generateBringWebUrl", () => {
    const items = [
      { itemId: "Milk", spec: "1 liter" },
      { itemId: "Eggs", spec: "6 pieces" },
    ];

    it("generates a correct Web import link", () => {
      const url = generateBringWebUrl(items);

      expect(url).toContain("https://deeplink.getbring.com/import");
      expect(url).toContain("source=Norish");

      const urlObj = new URL(url);
      const itemsParam = urlObj.searchParams.get("items");

      expect(itemsParam).toBeDefined();
      const parsedItems = JSON.parse(itemsParam!);
      expect(parsedItems).toEqual(items);
    });
  });
});
