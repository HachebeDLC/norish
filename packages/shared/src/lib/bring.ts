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
 * Generates a Web-to-App Bring! import URL using structured items.
 *
 * This endpoint accepts a JSON array of items directly in the URL.
 * It is the most reliable method for non-public URLs (e.g. localhost)
 * because it doesn't require Bring! to crawl the page.
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

/**
 * Generates a Web-to-App Bring! deep link via the official recipe parser endpoint.
 *
 * Bring! fetches `recipeUrl`, parses schema.org/Recipe markup (itemprop="ingredients"),
 * then redirects the user into the Bring! app on mobile or the Bring! web app on desktop.
 *
 * NOTE: This will FAIL for non-public URLs (like localhost) because Bring!'s
 * server cannot reach them to parse the ingredients.
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

  // Using api.getbring.com endpoint as specified in the official guide
  return `https://api.getbring.com/rest/bringrecipes/deeplink?${params.toString()}`;
}

/**
 * Generates an App-to-App Bring! deep link using the bringimport:// scheme.
 *
 * Only works in native mobile contexts (React Native / iOS / Android) where
 * the Bring! app handles the custom URL scheme.
 * Do NOT use this in a web browser.
 */
export function generateBringAppUrl(items: BringItem[]): string {
  const params = new URLSearchParams({
    items: JSON.stringify(items),
    source: SOURCE_NAME,
  });

  return `bringimport://import?${params.toString()}`;
}
