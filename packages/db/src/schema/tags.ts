import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { versionColumn } from "./shared";

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(),
    category: text("category").notNull().default("dietary"),
    hellofreshIds: text("hellofresh_ids").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    ...versionColumn,
  },
  (t) => [
    uniqueIndex("uqidx_tags_name_lower").on(sql`lower(${t.name})`),
    index("idx_tags_created_at").on(t.createdAt),
    index("idx_tags_category").on(t.category),
  ]
);
