import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { notebooks } from "./notebooks";

export const studyGuides = pgTable("study_guides", {
  id: serial("id").primaryKey(),
  notebookId: integer("notebook_id").notNull().references(() => notebooks.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  format: text("format").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StudyGuide = typeof studyGuides.$inferSelect;
