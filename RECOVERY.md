# DB Recovery Guide: Missing "version" Columns

If your server crashes on startup with an error like `column "version" does not exist`, it means the automatic migration runner skipped the optimistic locking update. 

Because the app container crashes, you must run the fix directly against the **database** container.

## 1. Apply the SQL Fix
Run this command from your project root on the server. It uses the `psql` tool inside your database container to force-add the missing columns:

```bash
docker compose exec db psql -U postgres -d norish -c '
ALTER TABLE "user_caldav_config" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "caldav_sync_status" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "groceries" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "household_users" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "households" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "tags" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipe_tags" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipe_ingredients" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "steps" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "step_images" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipe_images" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipe_videos" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "planned_items" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recurring_groceries" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "ingredient_store_preferences" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "server_config" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipe_favorites" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipe_ratings" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "user_allergies" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "site_auth_tokens" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "recipe_shares" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
'
```

*Note: If you changed your DB name or user in `.env`, replace `-U postgres` or `-d norish` as needed.*

## 2. Restart the Server
Once the SQL command finishes, rebuild and restart your app:

```bash
docker compose up -d --build
```

## Why this happened?
During the history squash, the migration journal and the database's internal tracker (`drizzle_migrations`) became out of sync. The app thought migrations were "done" because the filenames existed, but the actual database tables were missing the new columns. Manual application bypasses the tracker to fix the schema.
