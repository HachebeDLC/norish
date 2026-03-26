import { getBringConfig } from "@norish/config/server-config-loader";
import { serverLogger as log } from "@norish/shared-server/logger";
import { BringClient } from "./client";

/**
 * Sync Norish groceries to Bring!
 * 
 * @param items - List of groceries to sync
 */
export async function syncToBring(items: { name: string; amount?: string; unit?: string }[]): Promise<void> {
  const config = await getBringConfig(true);

  if (!config || !config.enabled || !config.email || !config.password || !config.listUuid) {
    log.debug("Bring! sync skipped: not configured or disabled.");
    return;
  }

  const client = new BringClient(config.email, config.password);

  try {
    // 1. Get current items in Bring! to avoid duplicates
    const currentBringItems = await client.getItems(config.listUuid);
    const existingNames = new Set(
      currentBringItems.purchase.map(i => i.name.toLowerCase())
    );

    // 2. Add new items
    for (const item of items) {
      if (existingNames.has(item.name.toLowerCase())) {
        log.debug({ item: item.name }, "Item already exists in Bring!, skipping.");
        continue;
      }

      const specification = item.amount ? `${item.amount} ${item.unit || ""}`.trim() : "";
      
      log.info({ item: item.name, specification }, "Adding item to Bring!...");
      await client.saveItem(config.listUuid, item.name, specification);
    }
  } catch (error: any) {
    log.error({ err: error }, "Failed to sync groceries to Bring!");
    throw error;
  }
}

/**
 * Mark item as completed in Bring!
 */
export async function completeInBring(itemName: string): Promise<void> {
  const config = await getBringConfig(true);

  if (!config || !config.enabled || !config.email || !config.password || !config.listUuid) {
    return;
  }

  const client = new BringClient(config.email, config.password);

  try {
    log.info({ item: itemName }, "Completing item in Bring!...");
    await client.completeItem(config.listUuid, itemName);
  } catch (error: any) {
    log.error({ err: error, item: itemName }, "Failed to complete item in Bring!");
  }
}
