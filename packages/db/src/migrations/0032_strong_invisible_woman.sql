DO $$ BEGIN
  ALTER TABLE "tags" ADD CONSTRAINT "tags_name_unique" UNIQUE("name");
EXCEPTION WHEN duplicate_table THEN
  -- constraint already exists, skip
END; $$;
