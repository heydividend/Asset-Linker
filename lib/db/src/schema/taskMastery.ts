import { doublePrecision, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { tasks } from "./tasks";

// Objective per-task mastery, derived from answered questions tagged to a task.
// Mirrors topicMastery so task-level scores are as honest as topic-level ones.
// Scoped per user: one row per (user, task).
export const taskMastery = pgTable(
  "task_mastery",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    taskId: integer("task_id").notNull().references(() => tasks.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    mastery: doublePrecision("mastery").notNull().default(0.5),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userTaskUnique: unique("task_mastery_user_task_unique").on(t.userId, t.taskId),
  }),
);

export type TaskMastery = typeof taskMastery.$inferSelect;
