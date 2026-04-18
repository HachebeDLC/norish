ALTER TABLE "tags" ADD COLUMN "category" text DEFAULT 'dietary' NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "hellofresh_ids" text[];--> statement-breakpoint
CREATE INDEX "idx_tags_category" ON "tags" USING btree ("category");