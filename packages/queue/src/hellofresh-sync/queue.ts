import { Queue } from "bullmq";
import { HelloFreshSyncJobData } from "@norish/queue/contracts/job-types";
import { getBullClient } from "@norish/queue/redis/bullmq";
import { QUEUE_NAMES, recipeImportJobOptions } from "../config";

/**
 * Create the HelloFresh sync queue.
 * Returns a new Queue instance - lifecycle managed by registry.
 */
export function createHelloFreshSyncQueue(): Queue<HelloFreshSyncJobData> {
  return new Queue<HelloFreshSyncJobData>(QUEUE_NAMES.HELLOFRESH_SYNC, {
    connection: getBullClient(),
    defaultJobOptions: recipeImportJobOptions,
  });
}
