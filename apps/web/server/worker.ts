import { redactUrl, serverLogger as log } from "@norish/shared-server/logger";
import { initializeServerConfig } from "@norish/config/env-config-server";
import { startWorkers, stopWorkers } from "@norish/queue/start-workers";

async function main() {
  const config = initializeServerConfig();

  log.info("-".repeat(50));
  log.info("NORISH WORKER MODE");
  log.info(`  Environment: ${config.NODE_ENV}`);
  log.info(`  Database: ${redactUrl(config.DATABASE_URL)}`);
  log.info("-".repeat(50));

  log.info("Starting background workers...");
  await startWorkers();
  log.info("Workers are active and listening for jobs.");
  log.info("-".repeat(50));

  // Graceful shutdown
  process.on("SIGTERM", async () => {
    log.info("SIGTERM received, stopping workers...");
    await stopWorkers();
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    log.info("SIGINT received, stopping workers...");
    await stopWorkers();
    process.exit(0);
  });
}

main().catch((err) => {
  log.fatal({ err }, "Worker startup failed");
  process.exit(1);
});
