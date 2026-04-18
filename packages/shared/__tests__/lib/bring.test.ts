import { describe, expect, it } from "vitest";
import {
  generateBringDeeplink,
  generateBringAppUrl,
  generateBringWebUrl,
  generateBringImportUrl,
} from "../../src/lib/bring";

describe("Bring! Integration Logic", () => {
  describe("generateBringDeeplink", () => {
    it("generates a correct deeplink URL with required params", () => {
      const url = generateBringDeeplink("https://example.com/recipe");

      expect(url).toContain("https://api.getbring.com/rest/bringrecipes/deeplink");
      expect(url).toContain("url=https%3A%2F%2Fexample.com%2Frecipe");
      expect(url).toContain("source=web");
    });
  });

  describe("generateBringAppUrl", () => {
    const items = [{ itemId: "Milk", spec: "1l" }];

    it("generates a correct App-to-App deep link", () => {
      const url = generateBringAppUrl(items);

      expect(url).toBe(
        `bringimport://import?items=%5B%7B%22itemId%22%3A%22Milk%22%2C%22spec%22%3A%221l%22%7D%5D&source=Norish`
      );
    });
  });

  describe("generateBringWebUrl", () => {
    const items = [{ itemId: "Milk", spec: "1 liter" }];

    it("generates a correct Web import link", () => {
      const url = generateBringWebUrl(items);

      expect(url).toContain("https://deeplink.getbring.com/import");
      expect(url).toContain("source=Norish");
    });
  });

  describe("generateBringImportUrl", () => {
    const items = [{ itemId: "Milk", spec: "1 liter" }];

    it("generates a correct platform import URL", () => {
      const url = generateBringImportUrl(items);

      expect(url).toContain("https://platform.getbring.com/widgets/import.html");
      expect(url).toContain("src=");
      expect(url).toContain("source=Norish");
    });
  });
});
