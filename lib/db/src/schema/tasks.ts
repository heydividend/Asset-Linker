import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { domains } from "./domains";

// Official BOC Practice Analysis 8th Edition task statements (e.g. "0101").
// These are the granular sub-competencies the exam is built from, sitting
// between a domain and its questions. `confidence` is the student's own
// self-rating (1 = shaky, 2 = okay, 3 = solid; null = not yet rated).
export const tasks = pgTable("tasks", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  domainId: integer("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  statement: text("statement").notNull(),
  confidence: integer("confidence"),
  sortOrder: integer("sort_order").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
