import { redactUrl, serverLogger as log } from "@norish/shared-server/logger";
import { initializeServerConfig } from "@norish/config/env-config-server";
import { addHelloFreshSyncJob, getQueues, initializeQueues, closeAllQueues } from "@norish/queue";
import { sql, eq } from "drizzle-orm";
import { recipes } from "@norish/db/schema";
import { db } from "@norish/db/drizzle";
import { createRecipeWithRefs } from "@norish/db/repositories/recipes";
import { getAdapterUserByEmail, setUserAsOwnerAndAdmin } from "@norish/db/repositories/users";
import { setConfig } from "@norish/db/repositories/server-config";
import { ServerConfigKeys } from "@norish/config/zod/server-config";
import { v4 as uuidv4 } from "uuid";
import { mapHelloFreshToNorish } from "@norish/shared-server/services/hellofresh/mapper";
import fs from "fs";
import { auth } from "@norish/auth";
import { users, verification } from "@norish/db/schema/auth";

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

async function runResetPassword(email?: string, newPassword?: string) {
  if (!email || !newPassword) {
    log.error("[CLI-Reset] Usage: reset-password <email> <new-password>");
    process.exit(1);
  }
  log.info({ email }, "[CLI-Reset] Attempting to force reset password...");
  try {
    const user = await getAdapterUserByEmail(email);
    if (!user) throw new Error("User not found with that email.");
    const token = uuidv4();
    await db.insert(verification).values({
      id: uuidv4(),
      identifier: email,
      value: token,
      expiresAt: new Date(Date.now() + 1000 * 60 * 10),
    });
    await auth.api.resetPassword({ body: { newPassword, token } });
    log.info("[CLI-Reset] Password successfully forced-reset for user.");
  } catch (error: any) {
    log.error({ err: error.message }, "[CLI-Reset] Failed to force reset password.");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

async function runDatabaseTruncate() {
  log.info("[CLI-Truncate] Starting database truncate (preserving recipes)...");
  const tables = [
    "session", "account", "apikey", "verification", "planned_item", "grocery",
    "recurring_grocery", "ingredient_store_preference", "store", "user_caldav_config",
    "caldav_sync_status", "api_log", "recipe_favorite", "recipe_rating",
    "user_allergy", "site_auth_token", "household_user", "user", "household",
  ];
  try {
    for (const table of tables) {
      await db.execute(sql.raw(`TRUNCATE TABLE "${table}" RESTART IDENTITY CASCADE`));
    }
    log.info("[CLI-Truncate] Database truncated successfully. Recipes preserved.");
  } catch (error: any) {
    log.error({ err: error.message }, "[CLI-Truncate] Failed to truncate database.");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

async function runEnableRegistration() {
  log.info("[CLI-Config] Attempting to enable user registration...");
  try {
    await setConfig(ServerConfigKeys.REGISTRATION_ENABLED, true, null, false);
    log.info("[CLI-Config] Registration enabled successfully. You can now use /signup.");
  } catch (error: any) {
    log.error({ err: error.message }, "[CLI-Config] Failed to enable registration.");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

async function runMakeAdmin(email?: string) {
  if (!email) {
    log.error("[CLI-Admin] Usage: make-admin <email>");
    process.exit(1);
  }
  log.info({ email }, "[CLI-Admin] Attempting to elevate user to Admin/Owner...");
  try {
    const user = await getAdapterUserByEmail(email);
    if (!user) throw new Error("User not found with that email.");
    await setUserAsOwnerAndAdmin(user.id);
    log.info(`[CLI-Admin] User ${email} is now a Server Owner and Admin.`);
  } catch (error: any) {
    log.error({ err: error.message }, "[CLI-Admin] Failed to elevate user.");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

async function runDeleteUser(email?: string) {
  if (!email) {
    log.error("[CLI-User] Usage: delete-user <email>");
    process.exit(1);
  }
  log.info({ email }, "[CLI-User] Attempting to delete user and all associated data...");
  try {
    const user = await getAdapterUserByEmail(email);
    if (!user) throw new Error("User not found with that email.");
    await db.delete(users).where(eq(users.id, user.id));
    log.info(`[CLI-User] User ${email} and all linked data have been deleted.`);
  } catch (error: any) {
    log.error({ err: error.message }, "[CLI-User] Failed to delete user.");
    process.exit(1);
  } finally {
    setTimeout(() => process.exit(0), 1000);
  }
}

async function main() {
  initializeServerConfig();
  const args = process.argv.slice(2);
  const command = args[0];
  log.info({ command, args: command === "reset-password" ? [args[1], "****"] : args }, "[CLI] Executing maintenance command");
  if (command === "hf-sync") return await runHelloFreshSync(args[1], args[2]);
  if (command === "hf-clean") return await runHelloFreshCleanup();
  if (command === "hf-import-file") return await runHelloFreshFileImport(args[1]);
  if (command === "reset-password") return await runResetPassword(args[1], args[2]);
  if (command === "db-truncate") return await runDatabaseTruncate();
  if (command === "enable-registration") return await runEnableRegistration();
  if (command === "make-admin") return await runMakeAdmin(args[1]);
  if (command === "delete-user") return await runDeleteUser(args[1]);
  log.error("Unknown command. Available: hf-sync, hf-clean, hf-import-file, reset-password, db-truncate, enable-registration, make-admin, delete-user");
  process.exit(1);
}

main().catch(err => {
  console.error("[CLI] Fatal error:", err);
  process.exit(1);
});
