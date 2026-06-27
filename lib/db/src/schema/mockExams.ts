import { boolean, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const mockExams = pgTable("mock_exams", {
  id: serial("id").primaryKey(),
  // Owning user (Clerk user id). Nullable so legacy pre-auth rows remain valid
  // but invisible to logged-in users; all new rows set it.
  userId: text("user_id"),
  totalQuestions: integer("total_questions").notNull(),
  timeLimitSec: integer("time_limit_sec").notNull(),
  questionIds: jsonb("question_ids").$type<number[]>().notNull(),
  answers: jsonb("answers").$type<(number | number[] | null)[]>().notNull(),
  currentIndex: integer("current_index").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submitted: boolean("submitted").notNull().default(false),
  autoSubmitted: boolean("auto_submitted").notNull().default(false),
  visibilityBreaks: integer("visibility_breaks").notNull().default(0),
  scorePercent: doublePrecision("score_percent"),
});

export type MockExam = typeof mockExams.$inferSelect;
