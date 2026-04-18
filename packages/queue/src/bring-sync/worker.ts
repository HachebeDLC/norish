import type { Job } from "bullmq";
import { BringSyncJobData } from "@norish/queue/contracts/job-types";
import { createLogger } from "@norish/shared-server/logger";
import { syncToBring } from "@norish/shared-server/services/bring/sync";
import { getGroceriesByIds, listGroceriesByUser } from "@norish/db/repositories/groceries";
import { getBullClient } from "@norish/queue/redis/bullmq";
import {
  baseWorkerOptions,
  QUEUE_NAMES,
  STALLED_INTERVAL,
  WORKER_CONCURRENCY,
} from "../config";
import { createLazyWorker, stopLazyWorker } from "../lazy-worker-manager";

const log = createLogger("worker:bring-sync");

async function processBringSyncJob(job: Job<BringSyncJobData>): Promise<void> {
  const { userId, itemIds } = job.data;

  log.info({ jobId: job.id, userId }, "Starting Bring! sync job");

  try {
    let items;
    if (itemIds && itemIds.length > 0) {
      items = await getGroceriesByIds(itemIds);
    } else {
      items = await listGroceriesByUser(userId, { includeDone: false });
    }

    if (items.length === 0) {
      log.info({ userId }, "No items to sync to Bring!");
      return;
    }

    const syncItems = items.map(i => ({
      name: i.name || "Unknown Item",
      amount: i.amount?.toString(),
      unit: i.unit || undefined
    }));

    await syncToBring(userId, syncItems);

    log.info({ userId, count: syncItems.length }, "Bring! sync job completed successfully");
  } catch (error: any) {
    log.error({ err: error, userId }, "Bring! sync job failed");
    throw error;
  }
}

export async function startBringSyncWorker(): Promise<void> {
  await createLazyWorker<BringSyncJobData>(
    QUEUE_NAMES.BRING_SYNC,
    processBringSyncJob,
    {
      connection: getBullClient(),
      ...baseWorkerOptions,
      stalledInterval: STALLED_INTERVAL[QUEUE_NAMES.BRING_SYNC],
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.BRING_SYNC],
    }
  );
}

export async function stopBringSyncWorker(): Promise<void> {
  await stopLazyWorker(QUEUE_NAMES.BRING_SYNC);
}
