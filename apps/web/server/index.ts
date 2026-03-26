import { initCaldavSync } from "@norish/api/caldav/event-listener";
import { redactUrl, serverLogger as log } from "@norish/shared-server/logger";
import { createServer } from "@norish/api/startup/http-server";
import { runStartupMaintenanceCleanup } from "@norish/api/startup/maintenance-cleanup";
import { migrateGalleryImages } from "@norish/api/startup/migrate-gallery-images";
import { runMigrations } from "@norish/api/startup/migrations";
import { seedServerConfig } from "@norish/api/startup/seed-config";
import { registerShutdownHandlers } from "@norish/api/startup/shutdown";
import { initializeVideoProcessing } from "@norish/api/startup/video-processing";
import { initializeServerConfig, SERVER_CONFIG } from "@norish/config/env-config-server";
import { addHelloFreshSyncJob, getQueues, initializeQueues, closeAllQueues } from "@norish/queue";
import { startWorkers } from "@norish/queue/start-workers";
import { sql } from "drizzle-orm";
import { recipes } from "@norish/db/schema";
import { db } from "@norish/db/drizzle";
import { createRecipeWithRefs } from "@norish/db/repositories/recipes";
import { v4 as uuidv4 } from "uuid";
import { mapHelloFreshToNorish } from "@norish/api/services/hellofresh/mapper";
import fs from "fs";
async function runHelloFreshSync(country?: string, locale?: string) {
  const countryCode = country || "ES";
  const hfLocale = locale || "es-ES";
  log.info(`[HF-Sync] Starting synchronization for ${countryCode} (${hfLocale})...`);
  initializeQueues();
  const queues = getQueues();
  try {
    const result = await addHelloFreshSyncJob(queues.hellofreshSync, {
      countryCode,
      locale: hfLocale,
    });
    log.info(`[HF-Sync] Job status: ${result.status}. Job ID: ${result.job?.id || "N/A"}`);
  } catch (error) {
    log.error({ err: error }, "[HF-Sync] Failed to enqueue job");
    process.exit(1);
  } finally {
    await closeAllQueues();
    setTimeout(() => process.exit(0), 1000);
  }
  }

  async function runHelloFreshFileImport(filePath: string) {
  log.info({ filePath }, "[HF-Import] Starting import from local file...");

  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const rawData = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(rawData);
    const items = json.items || [];

    log.info({ count: items.length }, `[HF-Import] Found ${items.length} recipes to process.`);

    let imported = 0;
    for (const hfRecipe of items) {
      try {
        const norishRecipe = mapHelloFreshToNorish(hfRecipe);
        const recipeId = uuidv4();
        await createRecipeWithRefs(recipeId, null, norishRecipe);
        imported++;
        if (imported % 10 === 0) log.info(`[HF-Import] Progress: ${imported}/${items.length}`);
      } catch (error) {
        log.error({ hfId: hfRecipe.id, err: error }, "[HF-Import] Failed to import recipe");
      }
    }

    log.info({ imported }, "[HF-Import] File import completed.");
  } catch (error) {
    log.error({ err: error }, "[HF-Import] Fatal error during file import");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
  }

  async function runHelloFreshCleanup() {

  log.info("[HF-Clean] Starting cleanup of HelloFresh recipes...");
  try {
    const result = await db
      .delete(recipes)
      .where(sql`${recipes.url} LIKE '%hellofresh.%'`);
    
    log.info({ count: result.rowCount }, "[HF-Clean] Successfully removed HelloFresh recipes.");
  } catch (error) {
    log.error({ err: error }, "[HF-Clean] Failed to cleanup recipes");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}
async function main() {
  const args = process.argv.slice(2);
  const isSyncMode = args.includes("hf-sync") || process.env.HF_SYNC_TRIGGER === "true";
  const isCleanMode = args.includes("hf-clean");
  const isFileImportMode = args.includes("hf-import-file");

  // CLI DISPATCHER - MUST BE BEFORE ANY SERVER LOGIC
  if (isSyncMode) {
    const idx = args.indexOf("hf-sync");
    const country = idx !== -1 ? args[idx + 1] : process.env.HF_COUNTRY;
    const locale = idx !== -1 ? args[idx + 2] : process.env.HF_LOCALE;
    await runHelloFreshSync(country, locale);
    return;
  }

  if (isCleanMode) {
    await runHelloFreshCleanup();
    return;
  }

  if (isFileImportMode) {
    const idx = args.indexOf("hf-import-file");
    const filePath = args[idx + 1];
    if (!filePath) {
      log.error("[HF-Import] No file path provided. Usage: hf-import-file <path>");
      process.exit(1);
    }
    await runHelloFreshFileImport(filePath);
    return;
  }

  // NORMAL SERVER STARTUP
  const config = initializeServerConfig();
  log.info("-".repeat(50));
  log.info("Server configuration loaded:");
  log.info(`  Environment: ${config.NODE_ENV}`);
  log.info(`  Database: ${redactUrl(config.DATABASE_URL)}`);
  log.info(`  Auth URL: ${config.AUTH_URL}`);
  log.info(`  Upload dir: ${config.UPLOADS_DIR}`);
  log.info("-".repeat(50));
  await runMigrations();
  log.info("-".repeat(50));
  await seedServerConfig();
  log.info("-".repeat(50));
  await migrateGalleryImages();
  log.info("-".repeat(50));
  await initializeVideoProcessing();
  log.info("-".repeat(50));
  await runStartupMaintenanceCleanup();
  log.info("-".repeat(50));
  initCaldavSync();
  log.info("CalDAV sync service initialized");
  log.info("-".repeat(50));
  await startWorkers();
  log.info("-".repeat(50));
  const { server, hostname, port } = await createServer();
  registerShutdownHandlers(server);
  server.listen(port, hostname, () => {
    log.info("-".repeat(50));
    log.info("Server ready:");
    log.info(`  HTTP: http://${hostname}:${port}`);
    log.info(`  WS:   ws://${hostname}:${port}/ws`);
    log.info(`  ENV:  ${SERVER_CONFIG.NODE_ENV}`);
    log.info("-".repeat(50));
  });
}
main().catch((err) => {
  log.fatal({ err }, "Server startup failed");
  process.exit(1);
});
