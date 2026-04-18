import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { sql } from "drizzle-orm";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString });
  const db = drizzle(pool);

  console.log("Adding missing 'version' columns to tables...");

  const tables = [
    "user_caldav_config",
    "caldav_sync_status",
    "groceries",
    "household_users",
    "households",
    "recipes",
    "tags",
    "ingredients",
    "recipe_tags",
    "recipe_ingredients",
    "steps",
    "step_images",
    "recipe_images",
    "recipe_videos",
    "planned_items",
    "recurring_groceries",
    "ingredient_store_preferences",
    "stores",
    "server_config",
    "recipe_favorites",
    "recipe_ratings",
    "user_allergies",
    "site_auth_tokens",
    "recipe_shares"
  ];

  for (const table of tables) {
    try {
      console.log(`Checking table: ${table}`);
      await db.execute(sql.raw(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;`));
      console.log(`  Done (added or already exists).`);
    } catch (error: any) {
      console.error(`  Error adding column to ${table}: ${error.message}`);
    }
  }

  console.log("Manual migration complete.");
  await pool.end();
}

main().catch(console.error);
