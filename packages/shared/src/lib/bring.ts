/**
 * Bring! Integration Utilities
 * 
 * Based on the official Bring! Import Developer Guide:
 * https://sites.google.com/getbring.com/bring-import-dev-guide/home
 */

export interface BringItem {
  itemId: string;
  spec: string;
}

export const BRING_BRAND_COLOR = "#da1a2c";

const BRING_WEB_BASE = "https://api.getbring.com/rest/v2/bringlists/import";
const BRING_APP_BASE = "bringimport://import";
const SOURCE_NAME = "Norish";

/**
 * Generates a Web-to-App Bring! import URL.
 */
export function generateBringWebUrl(items: BringItem[]): string {
  const payload = JSON.stringify(items);
  const params = new URLSearchParams({
    items: payload,
    source: SOURCE_NAME,
  });

  return `${BRING_WEB_BASE}?${params.toString()}`;
}

/**
 * Generates an App-to-App Bring! deep link.
 */
export function generateBringAppUrl(items: BringItem[]): string {
  const payload = JSON.stringify(items);
  const params = new URLSearchParams({
    items: payload,
    source: SOURCE_NAME,
  });

  // URLSearchParams.toString() works for custom schemes too
  return `${BRING_APP_BASE}?${params.toString()}`;
}
