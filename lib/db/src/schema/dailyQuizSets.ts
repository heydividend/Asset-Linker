import { jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Cache of the freshly-generated 50-question daily quiz, one row per calendar
// day (Pacific). Stores the ordered question ids that make up that day's set so
// the quiz is stable within the day but regenerated the next day.
export const dailyQuizSets = pgTable("daily_quiz_sets", {
  id: serial("id").primaryKey(),
  date: text("date").notNull().unique(),
  questionIds: jsonb("question_ids").$type<number[]>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type DailyQuizSet = typeof dailyQuizSets.$inferSelect;
