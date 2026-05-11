import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const fixItCompletions = pgTable(
  "fix_it_completions",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    date: text("date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    sessionDateUnique: uniqueIndex("fix_it_completions_session_date_unique").on(
      t.sessionId,
      t.date,
    ),
  }),
);

export type FixItCompletion = typeof fixItCompletions.$inferSelect;
