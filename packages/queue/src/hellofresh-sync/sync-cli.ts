import { initializeQueues, getQueues, addHelloFreshSyncJob, closeAllQueues } from "../index";

async function main() {
  const countryCode = process.argv[2] || "ES";
  const locale = process.argv[3] || "es-ES";

  console.log(`Enqueuing HelloFresh sync for ${countryCode} (${locale})...`);

  // Initialize queues (connects to Redis)
  initializeQueues();
  
  const queues = getQueues();

  try {
    const result = await addHelloFreshSyncJob(queues.hellofreshSync, {
      countryCode,
      locale,
      // No userId means global
    });

    if (result.status === "queued") {
      console.log(`Job successfully enqueued! Job ID: ${result.job.id}`);
    } else {
      console.log(`Sync already in progress or duplicate: ${result.status}`);
    }
  } catch (error) {
    console.error("Failed to enqueue job:", error);
    process.exit(1);
  } finally {
    await closeAllQueues();
    // BullMQ/ioredis might need a small moment to close connections
    setTimeout(() => process.exit(0), 500);
  }
}

main();
