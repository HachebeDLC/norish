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

async function runHelloFreshSync() {
  const countryCode = process.env.HF_COUNTRY || "ES";
  const locale = process.env.HF_LOCALE || "es-ES";

  log.info(`[HF-Sync] Mode detected. Starting sync for ${countryCode} (${locale})...`);

  initializeQueues();
  const queues = getQueues();

  try {
    const result = await addHelloFreshSyncJob(queues.hellofreshSync, {
      countryCode,
      locale,
    });
    log.info(`[HF-Sync] Job status: ${result.status}. Job ID: ${result.job?.id || 'N/A'}`);
  } catch (error) {
    log.error({ err: error }, "[HF-Sync] Failed to enqueue job");
    process.exit(1);
  } finally {
    await closeAllQueues();
    // Allow time for Redis connection to close
    setTimeout(() => process.exit(0), 1000);
  }
}

async function main() {
  const config = initializeServerConfig();

  // Mode check: if hf-sync, don't start the server
  if (process.env.NORISH_MODE === "hf-sync") {
    await runHelloFreshSync();
    return;
  }

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
