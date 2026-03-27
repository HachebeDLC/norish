import type { Job } from "bullmq";
import { v4 as uuidv4 } from "uuid";
import { HelloFreshSyncJobData } from "@norish/queue/contracts/job-types";
import { createLogger } from "@norish/shared-server/logger";
import { HelloFreshClient } from "@norish/api/services/hellofresh/client";
import { mapHelloFreshToNorish } from "@norish/api/services/hellofresh/mapper";
import { createRecipeWithRefs } from "@norish/db/repositories/recipes";
import { downloadImage } from "@norish/shared-server/media/storage";
import { getBullClient } from "@norish/queue/redis/bullmq";
import { db } from "@norish/db/drizzle";
import { recipes, steps, recipeIngredients } from "@norish/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { recipeEmitter } from "@norish/trpc/routers/recipes/emitter";
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
  const isGlobal = !userId;

  log.info(
    { jobId: job.id, countryCode, locale, userId: userId || "global" },
    "Starting HelloFresh sync job"
  );

  let page = 1;
  const take = 50;
  let totalImported = 0;

  // 1. Initial request to get total count
  let firstResponse;
  try {
    firstResponse = await hfClient.getRecipes(countryCode, locale, 1, 1);
  } catch (error: any) {
    log.error({ err: error }, "Failed to get initial HelloFresh count");
    recipeEmitter.emit("hellofreshSyncCompleted", {
      totalImported: 0,
      status: "failed",
      reason: "Could not connect to HelloFresh API"
    });
    throw error;
  }

  const hfTotal = firstResponse.total || 0;
  
  // 2. Get local count of HelloFresh recipes for this context
  const localResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(recipes)
    .where(
      and(
        sql`${recipes.url} LIKE '%hellofresh.%'`,
        isGlobal ? isNull(recipes.userId) : eq(recipes.userId, userId)
      )
    );
  
  const localTotal = Number(localResult[0]?.count || 0);

  log.info({ hfTotal, localTotal }, "Count check");

  if (hfTotal > 0 && localTotal >= hfTotal) {
    log.info("Local count matches or exceeds HelloFresh count. Skipping sync.");
    recipeEmitter.emit("hellofreshSyncProgress", {
      total: hfTotal,
      current: localTotal,
      page: 0,
      status: "skipped"
    });
    recipeEmitter.emit("hellofreshSyncCompleted", {
      totalImported: 0,
      status: "success"
    });
    return;
  }

  while (true) {
    recipeEmitter.emit("hellofreshSyncProgress", {
      total: hfTotal,
      current: totalImported,
      page,
      status: "fetching"
    });

    log.info({ countryCode, locale, page }, `Fetching page ${page} from HelloFresh...`);
    
    let response;
    try {
      response = await hfClient.getRecipes(countryCode, locale, page, take);
    } catch (error: any) {
      log.error({ err: error, page }, "Error fetching HelloFresh recipes");
      recipeEmitter.emit("hellofreshSyncCompleted", {
        totalImported,
        status: "failed",
        reason: `Error at page ${page}`
      });
      throw error;
    }

    const items = response.items || [];
    if (items.length === 0) {
      log.info({ countryCode, locale }, "No more recipes found. Sync completed.");
      break;
    }

    log.info({ count: items.length }, `Processing ${items.length} recipes...`);

    recipeEmitter.emit("hellofreshSyncProgress", {
      total: hfTotal,
      current: totalImported,
      page,
      status: "processing"
    });

    for (const hfSummary of items) {
      try {
        log.debug({ hfId: hfSummary.id }, "Fetching full recipe details...");
        
        // Update progress to keep job alive and inform BullMQ
        await job.updateProgress(Math.round((totalImported / hfTotal) * 100));

        // 1. Fetch detailed recipe data
        const hfFullRecipe = await hfClient.getRecipe(countryCode, locale, hfSummary.id);
        
        // 2. Map to Norish format
        const norishRecipe = mapHelloFreshToNorish(hfFullRecipe);
        
        // 3. Robust duplicate check
        const targetUserId = userId || null;
        const whereClause = targetUserId 
          ? and(eq(recipes.url, norishRecipe.url!), eq(recipes.userId, targetUserId))
          : and(eq(recipes.url, norishRecipe.url!), isNull(recipes.userId));

        const existing = await db.query.recipes.findFirst({
          where: whereClause,
          columns: { id: true }
        });

        // Use existing ID if found to update, otherwise new UUID
        const recipeId = existing?.id || uuidv4();

        // If recipe exists, we must clear old steps and ingredients to allow clean re-import
        if (existing) {
          await db.delete(steps).where(eq(steps.recipeId, recipeId));
          await db.delete(recipeIngredients).where(eq(recipeIngredients.recipeId, recipeId));
        }

        // 4. Download Images Locally
        if (norishRecipe.image) {
          try {
            const localPath = await downloadImage(norishRecipe.image, recipeId);
            norishRecipe.image = localPath;
          } catch (imgErr) {
            log.warn({ err: imgErr, url: norishRecipe.image }, "Failed to download main image");
          }
        }

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
        
        // 5. Save/Update to database
        await createRecipeWithRefs(recipeId, targetUserId, norishRecipe);
        
        totalImported++;

        recipeEmitter.emit("hellofreshSyncProgress", {
          total: hfTotal,
          current: totalImported,
          page,
          status: "processing"
        });

        // 500ms delay between recipes
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
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  recipeEmitter.emit("hellofreshSyncCompleted", {
    totalImported,
    status: "success"
  });

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
      lockDuration: 300_000, // 5 minutes
    }
  );
}

export async function stopHelloFreshSyncWorker(): Promise<void> {
  await stopLazyWorker(QUEUE_NAMES.HELLOFRESH_SYNC);
}
