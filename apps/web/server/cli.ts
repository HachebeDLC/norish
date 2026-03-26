import { redactUrl, serverLogger as log } from "@norish/shared-server/logger";
import { initializeServerConfig } from "@norish/config/env-config-server";
import { addHelloFreshSyncJob, getQueues, initializeQueues, closeAllQueues } from "@norish/queue";
import { sql } from "drizzle-orm";
import { recipes } from "@norish/db/schema";
import { db } from "@norish/db/drizzle";
import { createRecipeWithRefs } from "@norish/db/repositories/recipes";
import { v4 as uuidv4 } from "uuid";
import { mapHelloFreshToNorish } from "@norish/api/services/hellofresh/mapper";
import fs from "fs";
import { auth } from "@norish/auth";

async function runHelloFreshSync(country?: string, locale?: string) {
  const countryCode = country || "ES";
  const hfLocale = locale || "es-ES";
  log.info(`[CLI-Sync] Starting synchronization for ${countryCode} (${hfLocale})...`);
  initializeQueues();
  const queues = getQueues();
  try {
    const result = await addHelloFreshSyncJob(queues.hellofreshSync, { countryCode, locale: hfLocale });
    log.info(`[CLI-Sync] Job status: ${result.status}. Job ID: ${result.job?.id || "N/A"}`);
  } catch (error) {
    log.error({ err: error }, "[CLI-Sync] Failed to enqueue job");
    process.exit(1);
  } finally {
    await closeAllQueues();
    setTimeout(() => process.exit(0), 1000);
  }
}

async function runHelloFreshCleanup() {
  log.info("[CLI-Clean] Starting cleanup of HelloFresh recipes...");
  try {
    const result = await db.delete(recipes).where(sql`${recipes.url} LIKE '%hellofresh.%'`);
    log.info({ count: result.rowCount }, "[CLI-Clean] Successfully removed HelloFresh recipes.");
  } catch (error) {
    log.error({ err: error }, "[CLI-Clean] Failed to cleanup recipes");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

async function runHelloFreshFileImport(filePath: string) {
  log.info({ filePath }, "[CLI-Import] Starting import from local file...");
  try {
    if (!fs.existsSync(filePath)) throw new Error(`File not found: ${filePath}`);
    const json = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const items = json.items || [];
    log.info({ count: items.length }, `[CLI-Import] Processing ${items.length} recipes.`);
    let imported = 0;
    for (const hfRecipe of items) {
      try {
        const norishRecipe = mapHelloFreshToNorish(hfRecipe);
        await createRecipeWithRefs(uuidv4(), null, norishRecipe);
        imported++;
        if (imported % 10 === 0) log.info(`[CLI-Import] Progress: ${imported}/${items.length}`);
      } catch (error) {
        log.error({ hfId: hfRecipe.id, err: error }, "[CLI-Import] Failed to import recipe");
      }
    }
    log.info({ imported }, "[CLI-Import] Completed.");
  } catch (error) {
    log.error({ err: error }, "[CLI-Import] Fatal error");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

import { getAdapterUserByEmail } from "@norish/db/repositories/users";
...
async function runResetPassword(email?: string, newPassword?: string) {
  if (!email || !newPassword) {
    log.error("[CLI-Reset] Usage: reset-password <email> <new-password>");
    process.exit(1);
  }

  log.info({ email }, "[CLI-Reset] Attempting to reset password...");

  try {
    // 1. Find user using Norish's official repository (handles HMAC/Encryption)
    const user = await getAdapterUserByEmail(email);

    if (!user) {
      throw new Error("User not found with that email.");
    }

    // 2. Use Better Auth's internal administrative API to set the password
    // Better Auth 1.1+ uses changePassword or updatePassword under api
    // For admin resets, we can use the admin plugin if enabled, 
    // but here we'll use the server-side bypass
    await (auth.api as any).changePassword({
      body: {
        newPassword,
        userId: user.id,
      },
      // Passing internal headers to indicate this is a trusted server call
      headers: new Headers({ "trusted-call": "true" })
    });

    log.info("[CLI-Reset] Password successfully updated for user.");
  } catch (error: any) {
    log.error({ err: error.message }, "[CLI-Reset] Failed to reset password.");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

async function main() {
  initializeServerConfig(); // Required for DB connection
  const args = process.argv.slice(2);
  const command = args[0];

  log.info({ command, args: command === "reset-password" ? [args[1], "****"] : args }, "[CLI] Executing maintenance command");

  if (command === "hf-sync") return await runHelloFreshSync(args[1], args[2]);
  if (command === "hf-clean") return await runHelloFreshCleanup();
  if (command === "hf-import-file") return await runHelloFreshFileImport(args[1]);
  if (command === "reset-password") return await runResetPassword(args[1], args[2]);

  log.error("Unknown command. Available: hf-sync, hf-clean, hf-import-file, reset-password");
  process.exit(1);
}

main().catch(err => {
  console.error("[CLI] Fatal error:", err);
  process.exit(1);
});
