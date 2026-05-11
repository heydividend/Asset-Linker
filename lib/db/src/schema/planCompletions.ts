import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const planCompletions = pgTable(
  "plan_completions",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    date: text("date").notNull(),
    itemKey: text("item_key").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sessionDateKeyUnique: uniqueIndex(
      "plan_completions_session_date_key_unique",
    ).on(t.sessionId, t.date, t.itemKey),
  }),
);

export type PlanCompletion = typeof planCompletions.$inferSelect;
