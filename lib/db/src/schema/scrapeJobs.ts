import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const scrapeJobs = pgTable("scrape_jobs", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  sourceHost: text("source_host"),
  status: text("status").notNull().default("pending"),
  importedCount: integer("imported_count").notNull().default(0),
  pendingReviewCount: integer("pending_review_count").notNull().default(0),
  message: text("message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export type ScrapeJob = typeof scrapeJobs.$inferSelect;
