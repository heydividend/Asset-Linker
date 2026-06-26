import { doublePrecision, integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";

// Objective per-task mastery, derived from answered questions tagged to a task.
// Mirrors topicMastery so task-level scores are as honest as topic-level ones.
export const taskMastery = pgTable("task_mastery", {
  id: serial("id").primaryKey(),
  taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }).unique(),
  attempts: integer("attempts").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  mastery: doublePrecision("mastery").notNull().default(0.5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TaskMastery = typeof taskMastery.$inferSelect;
