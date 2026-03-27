import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { db, recipes } from "@norish/db";
import { sql } from "drizzle-orm";
import {
  addHelloFreshSyncJob,
} from "@norish/queue";
import { getQueues } from "@norish/queue/registry";

import { adminProcedure, authedProcedure } from "../middleware";
import { router } from "../trpc";
import { recipeEmitter } from "./recipes/emitter";
import { createPolicyAwareSubscription } from "../helpers";

const onSyncProgress = createPolicyAwareSubscription(
  recipeEmitter,
  "hellofreshSyncProgress",
  "hellofresh sync progress"
);

const onSyncCompleted = createPolicyAwareSubscription(
  recipeEmitter,
  "hellofreshSyncCompleted",
  "hellofresh sync completed"
);

export const hellofreshRouter = router({
  sync: authedProcedure
    .input(
      z.object({
        countryCode: z.string().min(2).max(5).default("ES"),
        locale: z.string().min(2).max(10).default("es-ES"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { countryCode, locale } = input;
      const queues = getQueues();

      const result = await addHelloFreshSyncJob(queues.hellofreshSync, {
        countryCode,
        locale,
        userId: ctx.user.id,
        householdKey: ctx.householdKey,
        householdUserIds: ctx.householdUserIds,
      });

      if (result.status === "duplicate") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "HelloFresh sync is already in progress",
        });
      }

      return { success: true, jobId: result.job.id };
    }),

  cleanup: adminProcedure.mutation(async () => {
    const result = await db
      .delete(recipes)
      .where(sql`${recipes.url} LIKE '%hellofresh.%'`);

    return { success: true, count: result.rowCount };
  }),

  // Subscriptions
  onSyncProgress,
  onSyncCompleted,
});
