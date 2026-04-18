import { Queue } from "bullmq";
import { BringSyncJobData } from "@norish/queue/contracts/job-types";
import { getBullClient } from "@norish/queue/redis/bullmq";
import { QUEUE_NAMES, recipeImportJobOptions } from "../config";

/**
 * Create the Bring! sync queue.
 * Returns a new Queue instance - lifecycle managed by registry.
 */
export function createBringSyncQueue(): Queue<BringSyncJobData> {
  return new Queue<BringSyncJobData>(QUEUE_NAMES.BRING_SYNC, {
    connection: getBullClient(),
    defaultJobOptions: recipeImportJobOptions,
  });
}
