import { describe, expect, it } from "vitest";
import { generateBringWebUrl, generateBringAppUrl } from "../../src/lib/bring";

describe("Bring! Integration Logic", () => {
  const items = [
    { itemId: "Milk", spec: "1 liter" },
    { itemId: "Eggs", spec: "6 pieces" },
  ];

  describe("generateBringWebUrl", () => {
    it("generates a correct Web-to-App import URL", () => {
      const url = generateBringWebUrl(items);
      expect(url).toContain("https://api.getbring.com/rest/v2/bringlists/import");
      expect(url).toContain("source=Norish");
      
      const urlObj = new URL(url);
      const itemsParam = urlObj.searchParams.get("items");
      expect(itemsParam).toBeDefined();
      
      const parsedItems = JSON.parse(itemsParam!);
      expect(parsedItems).toEqual(items);
    });

    it("handles special characters in item names", () => {
      const complexItems = [{ itemId: "Chili-Flocken", spec: "1 Prise" }];
      const url = generateBringWebUrl(complexItems);
      expect(decodeURIComponent(url)).toContain("Chili-Flocken");
    });
  });

  describe("generateBringAppUrl", () => {
    it("generates a correct App-to-App deep link", () => {
      const url = generateBringAppUrl(items);
      expect(url).toContain("bringimport://import");
      expect(url).toContain("source=Norish");
      
      // Manually parse the "fake" URL scheme
      const queryString = url.split("?")[1];
      const params = new URLSearchParams(queryString);
      const itemsParam = params.get("items");
      
      expect(itemsParam).toBeDefined();
      const parsedItems = JSON.parse(itemsParam!);
      expect(parsedItems).toEqual(items);
    });
  });
});
