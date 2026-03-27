import type { ServerConfigKey } from "@norish/config/zod/server-config";

import { z } from "zod";
import {
  SchedulerCleanupMonthsSchema,
  SENSITIVE_CONFIG_KEYS,
  ServerConfigKeys,
} from "@norish/config/zod/server-config";
import { setConfig } from "@norish/db/repositories/server-config";
import { db, recipes } from "@norish/db";
import { sql } from "drizzle-orm";
import { addHelloFreshSyncJob } from "@norish/queue";
import { getQueues } from "@norish/queue/registry";
import { getDefaultConfigValue } from "@norish/shared-server/config/defaults";
import { trpcLogger as log } from "@norish/shared-server/logger";

import { adminProcedure } from "../../middleware";
import { router } from "../../trpc";

/**
 * Update scheduler cleanup months.
 */
const updateSchedulerMonths = adminProcedure
  .input(SchedulerCleanupMonthsSchema)
  .mutation(async ({ input, ctx }) => {
    log.info({ userId: ctx.user.id, months: input }, "Updating scheduler cleanup months");

    await setConfig(ServerConfigKeys.SCHEDULER_CLEANUP_MONTHS, input, ctx.user.id, false);

    return { success: true };
  });

/**
 * Restore a config to its default value.
 */
const restoreDefault = adminProcedure
  .input(z.enum(ServerConfigKeys))
  .mutation(async ({ input, ctx }) => {
    log.info({ userId: ctx.user.id, key: input }, "Restoring default config");

    const defaultValue = getDefaultConfigValue(input as ServerConfigKey);

    if (defaultValue === null) {
      return { success: false, error: `No default value available for ${input}` };
    }

    const isSensitive = SENSITIVE_CONFIG_KEYS.includes(input as ServerConfigKey);

    await setConfig(input as ServerConfigKey, defaultValue, ctx.user.id, isSensitive);

    return { success: true };
  });

/**
 * Restart the server.
 * Schedules an exit for after the response is sent.
 */
const restartServer = adminProcedure.mutation(async ({ ctx }) => {
  log.info({ userId: ctx.user.id }, "Server restart requested by admin");

  // Schedule the exit for after the response is sent
  setTimeout(() => {
    log.info("Exiting process for restart...");
    process.exit(0);
  }, 500);

  return { success: true };
});

const hellofreshSync = adminProcedure
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
      householdKey: "",
    });

    if (result.status === "duplicate") {
      throw new Error("HelloFresh sync is already in progress");
    }

    return { success: true, jobId: result.job.id };
  });

const hellofreshCleanup = adminProcedure.mutation(async () => {
  const result = await db.delete(recipes).where(sql`${recipes.url} LIKE '%hellofresh.%'`);

  return { success: true, count: result.rowCount };
});

export const systemProcedures = router({
  updateSchedulerMonths,
  restoreDefault,
  restartServer,
  hellofreshSync,
  hellofreshCleanup,
});
