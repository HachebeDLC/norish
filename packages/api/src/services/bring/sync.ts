import { serverLogger as log } from "@norish/shared-server/logger";
import { BringClient } from "./client";
import { getUserBringConfig } from "./config";

/**
 * Sync Norish groceries to Bring! for a specific user.
 * 
 * @param userId - The user whose groceries are being synced
 * @param items - List of groceries to sync
 */
export async function syncToBring(
  userId: string, 
  items: { name: string; amount?: string; unit?: string }[]
): Promise<void> {
  const config = await getUserBringConfig(userId);

  if (!config.enabled || !config.email || !config.password || !config.listUuid) {
    log.debug({ userId }, "Bring! sync skipped: not configured for this user.");
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
        log.debug({ item: item.name, userId }, "Item already exists in Bring!, skipping.");
        continue;
      }

      const specification = item.amount ? `${item.amount} ${item.unit || ""}`.trim() : "";
      
      log.info({ item: item.name, specification, userId }, "Adding item to user Bring! list...");
      await client.saveItem(config.listUuid, item.name, specification);
    }
  } catch (error: any) {
    log.error({ err: error, userId }, "Failed to sync groceries to user Bring! account");
    throw error;
  }
}

/**
 * Mark item as completed in Bring! for a specific user.
 */
export async function completeInBring(userId: string, itemName: string): Promise<void> {
  const config = await getUserBringConfig(userId);

  if (!config.enabled || !config.email || !config.password || !config.listUuid) {
    return;
  }

  const client = new BringClient(config.email, config.password);

  try {
    log.info({ item: itemName, userId }, "Completing item in user Bring! list...");
    await client.completeItem(config.listUuid, itemName);
  } catch (error: any) {
    log.error({ err: error, item: itemName, userId }, "Failed to complete item in Bring!");
  }
}
