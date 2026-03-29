/**
 * Bring! Integration Utilities
 *
 * Based on the official Bring! Import Developer Guide:
 * https://sites.google.com/getbring.com/bring-import-dev-guide/web-to-app-integration
 */

export interface BringItem {
  itemId: string;
  spec: string;
}

export const BRING_BRAND_COLOR = "#da1a2c";

const SOURCE_NAME = "Norish";

/**
 * Generates a Web-to-App Bring! deep link using the official deeplink endpoint.
 *
 * Bring! will parse the recipe page at `recipeUrl` for schema.org/Recipe markup
 * and redirect the user into the Bring! app (or web app on desktop) with the
 * ingredients pre-loaded.
 *
 * Requires itemprop="ingredients" elements on the recipe page.
 */
export function generateBringDeeplink(
  recipeUrl: string,
  baseQuantity: number = 4,
  requestedQuantity: number = 4
): string {
  const params = new URLSearchParams({
    url: recipeUrl,
    source: "web",
    baseQuantity: String(baseQuantity),
    requestedQuantity: String(requestedQuantity),
  });

  return `https://api.getbring.com/rest/bringrecipes/deeplink?${params.toString()}`;
}

/**
 * Generates an App-to-App Bring! deep link using the bringimport:// scheme.
 * Use this in native mobile apps (React Native).
 */
export function generateBringAppUrl(items: BringItem[]): string {
  const params = new URLSearchParams({
    items: JSON.stringify(items),
    source: SOURCE_NAME,
  });

  return `bringimport://import?${params.toString()}`;
}

/**
 * Generates a Web-to-Web Bring! import link using the https://www.getbring.com/import endpoint.
 * Use this on the web to open Bring! in a new browser tab.
 */
export function generateBringWebUrl(items: BringItem[]): string {
  const params = new URLSearchParams({
    items: JSON.stringify(items),
    source: SOURCE_NAME,
  });

  return `https://www.getbring.com/import?${params.toString()}`;
}
