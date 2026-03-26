import { addHelloFreshSyncJob, getQueues, initializeQueues, closeAllQueues } from "@norish/queue";

async function main() {
  const countryCode = process.argv[2] || "ES";
  const locale = process.argv[3] || "es-ES";

  console.log(`[HF-Sync] Enqueuing HelloFresh sync for ${countryCode} (${locale})...`);

  // Initialize queues (connects to Redis)
  initializeQueues();
  
  const queues = getQueues();

  try {
    const result = await addHelloFreshSyncJob(queues.hellofreshSync, {
      countryCode,
      locale,
    });

    if (result.status === "queued") {
      console.log(`[HF-Sync] Job successfully enqueued! Job ID: ${result.job.id}`);
    } else {
      console.log(`[HF-Sync] Sync already in progress or duplicate: ${result.status}`);
    }
  } catch (error) {
    console.error("[HF-Sync] Failed to enqueue job:", error);
    process.exit(1);
  } finally {
    await closeAllQueues();
    // BullMQ/ioredis might need a small moment to close connections
    setTimeout(() => process.exit(0), 1000);
  }
}

main().catch(err => {
  console.error("[HF-Sync] Fatal error:", err);
  process.exit(1);
});
