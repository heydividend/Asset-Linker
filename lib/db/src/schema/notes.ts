import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { notebooks } from "./notebooks";
import { topics } from "./topics";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  notebookId: integer("notebook_id").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  content: text("content").notNull(),
  sourceKind: text("source_kind").notNull().default("text"),
  sourceUrl: text("source_url"),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
