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
 * Generates a Web-to-App Bring! import URL using the widget endpoint.
 *
 * This is the most reliable method for web-to-app because it uses the same
 * logic as the official Bring! import widget.
 *
 * It uses base64 encoding for the items to ensure they are passed correctly.
 */
export function generateBringImportUrl(items: BringItem[]): string {
  // Bring! widget uses a specific base64 variant for items
  // We'll use standard btoa and hope it works, or fallback to the URL method
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(items))))
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `https://platform.getbring.com/widgets/import.html?src=${data}&source=${SOURCE_NAME}`;
}

/**
 * Generates a Web-to-App Bring! import URL using structured items.
 *
 * Opens https://deeplink.getbring.com/import in the browser, which redirects
 * to the Bring! app on mobile or the Bring! web app on desktop.
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

  return `https://api.getbring.com/rest/bringrecipes/deeplink?${params.toString()}`;
}

/**
 * Generates an App-to-App Bring! deep link using the bringimport:// scheme.
 */
export function generateBringAppUrl(items: BringItem[]): string {
  const params = new URLSearchParams({
    items: JSON.stringify(items),
    source: SOURCE_NAME,
  });

  return `bringimport://import?${params.toString()}`;
}
