import { jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// Cache of the freshly-generated 50-question daily quiz, one row per calendar
// day (Pacific) PER USER. Stores the ordered question ids that make up that
// day's set so the quiz is stable within the day but regenerated the next day.
export const dailyQuizSets = pgTable(
  "daily_quiz_sets",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    date: text("date").notNull(),
    questionIds: jsonb("question_ids").$type<number[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userDateUnique: unique("daily_quiz_sets_user_date_unique").on(t.userId, t.date),
  }),
);

export type DailyQuizSet = typeof dailyQuizSets.$inferSelect;
