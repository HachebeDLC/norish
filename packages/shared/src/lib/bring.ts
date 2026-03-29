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
 * Generates a Web-to-App Bring! deep link via the official recipe parser endpoint.
 *
 * Bring! fetches `recipeUrl`, parses schema.org/Recipe markup (itemprop="ingredients"),
 * then redirects the user into the Bring! app on mobile or the Bring! web app on desktop.
 *
 * This is the ONLY supported import path for web — there is no public Bring! endpoint
 * that accepts raw JSON items from a browser.
 *
 * Requirements: the recipe page at `recipeUrl` must include schema.org/Recipe markup
 * with `itemprop="ingredients"` on each ingredient element.
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
 *
 * Only works in native mobile contexts (React Native / iOS / Android) where
 * the Bring! app handles the custom URL scheme.
 * Do NOT use this in a web browser — it will not work.
 */
export function generateBringAppUrl(items: BringItem[]): string {
  const params = new URLSearchParams({
    items: JSON.stringify(items),
    source: SOURCE_NAME,
  });

  return `bringimport://import?${params.toString()}`;
}

/**
 * Generates a Web-to-Web Bring! import URL using the structured items format.
 *
 * Opens https://deeplink.getbring.com/import in the browser, which redirects
 * to the Bring! app on mobile or the Bring! web app on desktop.
 *
 * Items should use clean, short specs — e.g. "150 g" not "150 gramo(s)".
 */
export function generateBringWebUrl(items: BringItem[]): string {
  const params = new URLSearchParams({
    items: JSON.stringify(items),
    source: SOURCE_NAME,
  });

  return `https://deeplink.getbring.com/import?${params.toString()}`;
}
