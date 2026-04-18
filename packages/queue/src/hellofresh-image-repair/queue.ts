import { Queue } from "bullmq";
import { HelloFreshImageRepairJobData } from "@norish/queue/contracts/job-types";
import { getBullClient } from "@norish/queue/redis/bullmq";
import { QUEUE_NAMES } from "../config";

export function createHelloFreshImageRepairQueue(): Queue<HelloFreshImageRepairJobData> {
  return new Queue<HelloFreshImageRepairJobData>(QUEUE_NAMES.HELLOFRESH_IMAGE_REPAIR, {
    connection: getBullClient(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { age: 86400, count: 10 },
      removeOnFail: { age: 86400, count: 10 },
    },
  });
}
