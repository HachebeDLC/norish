import type { Queue } from "bullmq";
import { HelloFreshSyncJobData } from "@norish/queue/contracts/job-types";
import { createLogger } from "@norish/shared-server/logger";
import { generateJobId, isJobInQueue } from "../helpers";

const log = createLogger("queue:hellofresh-sync");

/**
 * Add a HelloFresh sync job to the queue.
 */
export async function addHelloFreshSyncJob(
  queue: Queue<HelloFreshSyncJobData>,
  data: HelloFreshSyncJobData
) {
  // Unique job ID per household, locale and timestamp to allow re-runs
  const householdSegment = data.householdKey || "global";
  const timestamp = Date.now();
  const jobId = `hf-sync-${householdSegment}-${data.countryCode}-${data.locale}-${timestamp}`;

  if (await isJobInQueue(queue, jobId)) {
    log.warn({ jobId }, "Duplicate HelloFresh sync job rejected");
    return { status: "duplicate", existingJobId: jobId };
  }

  const job = await queue.add("sync", data, { jobId });

  log.info(
    { countryCode: data.countryCode, locale: data.locale, jobId: job.id },
    "HelloFresh sync job added to queue"
  );

  return { status: "queued", job };
}
