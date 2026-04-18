import type { Queue } from "bullmq";
import type {
  AddHelloFreshImageRepairJobResult,
  HelloFreshImageRepairJobData,
} from "@norish/queue/contracts/job-types";
import { createLogger } from "@norish/shared-server/logger";
import { isJobInQueue } from "../helpers";

const log = createLogger("queue:hellofresh-image-repair");

const GLOBAL_JOB_ID = "hf-image-repair-global";

export async function addHelloFreshImageRepairJob(
  queue: Queue<HelloFreshImageRepairJobData>,
  data: HelloFreshImageRepairJobData = {}
): Promise<AddHelloFreshImageRepairJobResult> {
  // Only one repair run at a time — use a stable ID so duplicate checks work
  const jobId = data.recipeId ? `hf-image-repair-${data.recipeId}` : GLOBAL_JOB_ID;

  if (await isJobInQueue(queue, jobId)) {
    log.warn({ jobId }, "Duplicate HelloFresh image repair job rejected");
    return { status: "duplicate", existingJobId: jobId };
  }

  const job = await queue.add("repair", data, { jobId });

  log.info({ jobId: job.id, recipeId: data.recipeId ?? "all" }, "HelloFresh image repair job queued");

  return { status: "queued", job };
}
