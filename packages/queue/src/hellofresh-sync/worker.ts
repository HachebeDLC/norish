import type { Job } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { HelloFreshSyncJobData } from "@norish/queue/contracts/job-types";
import { createLogger } from "@norish/shared-server/logger";
import { HelloFreshClient } from "@norish/api/services/hellofresh/client";
import { mapHelloFreshToNorish } from "@norish/api/services/hellofresh/mapper";
import { createRecipeWithRefs } from "@norish/db/repositories/recipes";
import { downloadImage } from "@norish/shared-server/media/storage";
import { getBullClient } from "@norish/queue/redis/bullmq";
import {
  baseWorkerOptions,
  QUEUE_NAMES,
  STALLED_INTERVAL,
  WORKER_CONCURRENCY,
} from "../config";
import { createLazyWorker, stopLazyWorker } from "../lazy-worker-manager";

const log = createLogger("worker:hellofresh-sync");
const hfClient = new HelloFreshClient();

async function processSyncJob(job: Job<HelloFreshSyncJobData>): Promise<void> {
  const { countryCode, locale, userId } = job.data;

  log.info(
    { jobId: job.id, countryCode, locale, userId: userId || "global" },
    "Starting HelloFresh sync job"
  );

  let page = 1;
  const take = 50;
  let totalImported = 0;

  while (true) {
    log.info({ countryCode, locale, page }, `Fetching page ${page} from HelloFresh...`);
    
    let response;
    try {
      response = await hfClient.getRecipes(countryCode, locale, page, take);
    } catch (error: any) {
      log.error({ err: error, page }, "Error fetching HelloFresh recipes");
      // Wait a bit and retry if it's a transient error, or throw to let BullMQ handle retry
      throw error;
    }

    const items = response.items || [];
    if (items.length === 0) {
      log.info({ countryCode, locale }, "No more recipes found. Sync completed.");
      break;
    }

    for (const hfSummary of items) {
      try {
        log.debug({ hfId: hfSummary.id }, "Fetching full recipe details...");
        
        // 1. Fetch detailed recipe data
        const hfFullRecipe = await hfClient.getRecipe(countryCode, locale, hfSummary.id);
        
        // 2. Map to Norish format
        const norishRecipe = mapHelloFreshToNorish(hfFullRecipe);
        const recipeId = uuidv4();

        // 3. Download Images Locally
        if (norishRecipe.image) {
          try {
            log.debug({ recipeId }, "Downloading main image...");
            const localPath = await downloadImage(norishRecipe.image, recipeId);
            norishRecipe.image = localPath;
          } catch (imgErr) {
            log.warn({ err: imgErr, url: norishRecipe.image }, "Failed to download main image, keeping remote URL");
          }
        }

        // Download step images
        if (norishRecipe.steps) {
          for (const step of norishRecipe.steps) {
            if (step.images) {
              for (const img of step.images) {
                if (img.image) {
                  try {
                    const localStepImg = await downloadImage(img.image, recipeId);
                    img.image = localStepImg;
                  } catch (stepImgErr) {
                    log.warn({ err: stepImgErr, url: img.image }, "Failed to download step image");
                  }
                }
              }
            }
          }
        }
        
        // 4. Save to database
        await createRecipeWithRefs(recipeId, userId || null, norishRecipe);
        
        totalImported++;
        // 500ms delay between recipes to avoid rate limiting and DB stress
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error: any) {
        log.error({ err: error, hfId: hfSummary.id }, "Error importing HelloFresh recipe");
      }
    }

    if (items.length < take) {
      log.info({ countryCode, locale }, "Reached last page. Sync completed.");
      break;
    }

    page++;
    // Delay between pages
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  log.info({ countryCode, locale, totalImported }, "HelloFresh sync job finished");
}

export async function startHelloFreshSyncWorker(): Promise<void> {
  await createLazyWorker<HelloFreshSyncJobData>(
    QUEUE_NAMES.HELLOFRESH_SYNC,
    processSyncJob,
    {
      connection: getBullClient(),
      ...baseWorkerOptions,
      stalledInterval: STALLED_INTERVAL[QUEUE_NAMES.HELLOFRESH_SYNC],
      concurrency: WORKER_CONCURRENCY[QUEUE_NAMES.HELLOFRESH_SYNC],
    }
  );
}

export async function stopHelloFreshSyncWorker(): Promise<void> {
  await stopLazyWorker(QUEUE_NAMES.HELLOFRESH_SYNC);
}
