import type { Queue } from "bullmq";
import { BringSyncJobData } from "@norish/queue/contracts/job-types";
import { createLogger } from "@norish/shared-server/logger";
import { isJobInQueue } from "../helpers";

const log = createLogger("queue:bring-sync");

/**
 * Add a Bring! sync job to the queue.
 */
export async function addBringSyncJob(
  queue: Queue<BringSyncJobData>,
  data: BringSyncJobData
) {
  // Unique job ID per user and sync type
  const itemsKey = data.itemIds ? `items:${data.itemIds.sort().join(",")}` : "all";
  const jobId = `bring-sync:${data.userId}:${itemsKey}`;

  if (await isJobInQueue(queue, jobId)) {
    log.warn({ jobId }, "Duplicate Bring! sync job rejected");
    return { status: "duplicate", existingJobId: jobId };
  }

  const job = await queue.add("sync", data, { jobId });

  log.info(
    { userId: data.userId, jobId: job.id },
    "Bring! sync job added to queue"
  );

  return { status: "queued", job };
}
