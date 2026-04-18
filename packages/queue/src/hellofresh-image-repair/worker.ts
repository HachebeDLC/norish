import type { Job } from "bullmq";
import { eq, like, and } from "drizzle-orm";
import { HelloFreshImageRepairJobData } from "@norish/queue/contracts/job-types";
import { db } from "@norish/db/drizzle";
import { recipeImages, recipes, stepImages, steps } from "@norish/db/schema";
import { createLogger } from "@norish/shared-server/logger";
import { downloadImage } from "@norish/shared-server/media/storage";
import { getBullClient } from "@norish/queue/redis/bullmq";
import {
  baseWorkerOptions,
  QUEUE_NAMES,
  STALLED_INTERVAL,
  WORKER_CONCURRENCY,
} from "../config";
import { createLazyWorker, stopLazyWorker } from "../lazy-worker-manager";

const log = createLogger("worker:hellofresh-image-repair");

async function tryDownload(url: string, recipeId: string): Promise<string | null> {
  try {
    return await downloadImage(url, recipeId);
  } catch (err) {
    log.warn({ err, url, recipeId }, "Could not download image — will null/remove");
    return null;
  }
}

async function repairRecipeMainImages(recipeId?: string): Promise<number> {
  const condition = recipeId
    ? and(like(recipes.image, "https://%"), eq(recipes.id, recipeId))
    : like(recipes.image, "https://%");

  const rows = await db
    .select({ id: recipes.id, image: recipes.image })
    .from(recipes)
    .where(condition);

  log.info({ count: rows.length }, "Repairing main recipe images");

  let fixed = 0;

  for (const row of rows) {
    const localPath = await tryDownload(row.image!, row.id);

    await db.update(recipes).set({ image: localPath }).where(eq(recipes.id, row.id));

    log.info({ recipeId: row.id, result: localPath ?? "null (404)" }, "Main image updated");
    fixed++;
  }

  return fixed;
}

async function repairGalleryImages(recipeId?: string): Promise<number> {
  const condition = recipeId
    ? and(like(recipeImages.image, "https://%"), eq(recipeImages.recipeId, recipeId))
    : like(recipeImages.image, "https://%");

  const rows = await db
    .select({ id: recipeImages.id, recipeId: recipeImages.recipeId, image: recipeImages.image })
    .from(recipeImages)
    .where(condition);

  log.info({ count: rows.length }, "Repairing gallery images");

  let fixed = 0;

  for (const row of rows) {
    const localPath = await tryDownload(row.image, row.recipeId);

    if (localPath) {
      await db.update(recipeImages).set({ image: localPath }).where(eq(recipeImages.id, row.id));
    } else {
      await db.delete(recipeImages).where(eq(recipeImages.id, row.id));
    }

    log.info({ id: row.id, result: localPath ?? "deleted (404)" }, "Gallery image processed");
    fixed++;
  }

  return fixed;
}

async function repairStepImages(recipeId?: string): Promise<number> {
  const condition = recipeId
    ? and(like(stepImages.image, "https://%"), eq(steps.recipeId, recipeId))
    : like(stepImages.image, "https://%");

  const rows = await db
    .select({
      id: stepImages.id,
      stepId: stepImages.stepId,
      image: stepImages.image,
      recipeId: steps.recipeId,
    })
    .from(stepImages)
    .innerJoin(steps, eq(stepImages.stepId, steps.id))
    .where(condition);

  log.info({ count: rows.length }, "Repairing step images");

  let fixed = 0;

  for (const row of rows) {
    const localPath = await tryDownload(row.image, row.recipeId);

    if (localPath) {
      await db.update(stepImages).set({ image: localPath }).where(eq(stepImages.id, row.id));
    } else {
      await db.delete(stepImages).where(eq(stepImages.id, row.id));
    }

    log.info({ id: row.id, result: localPath ?? "deleted (404)" }, "Step image processed");
    fixed++;
  }

  return fixed;
}

async function processRepairJob(job: Job<HelloFreshImageRepairJobData>): Promise<void> {
  const { recipeId } = job.data;

  log.info({ jobId: job.id, recipeId: recipeId ?? "all" }, "Starting HelloFresh image repair");

  await job.updateProgress(0);

  const mainFixed = await repairRecipeMainImages(recipeId);
  await job.updateProgress(33);

  const galleryFixed = await repairGalleryImages(recipeId);
  await job.updateProgress(66);

  const stepFixed = await repairStepImages(recipeId);
  await job.updateProgress(100);

  log.info(
    { mainFixed, galleryFixed, stepFixed, recipeId: recipeId ?? "all" },
    "HelloFresh image repair complete"
  );
}

export async function startHelloFreshImageRepairWorker(): Promise<void> {
  await createLazyWorker<HelloFreshImageRepairJobData>(
    QUEUE_NAMES.HELLOFRESH_IMAGE_REPAIR,
    processRepairJob,
    {
      connection: getBullClient(),
      ...baseWorkerOptions,
      stalledInterval: STALLED_INTERVAL[QUEUE_NAMES.HELLOFRESH_IMAGE_REPAIR],
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.HELLOFRESH_IMAGE_REPAIR],
      lockDuration: 600_000, // 10 minutes — repair can be slow
    }
  );
}

export async function stopHelloFreshImageRepairWorker(): Promise<void> {
  await stopLazyWorker(QUEUE_NAMES.HELLOFRESH_IMAGE_REPAIR);
}
