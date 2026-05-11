import { boolean, doublePrecision, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const quizzes = pgTable("quizzes", {
  id: serial("id").primaryKey(),
  mode: text("mode").notNull(),
  notebookId: integer("notebook_id"),
  topicId: integer("topic_id"),
  domainId: integer("domain_id"),
  questionIds: jsonb("question_ids").$type<number[]>().notNull(),
  currentIndex: integer("current_index").notNull().default(0),
  finished: boolean("finished").notNull().default(false),
  score: doublePrecision("score"),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const quizAnswers = pgTable("quiz_answers", {
  id: serial("id").primaryKey(),
  quizId: integer("quiz_id").notNull().references(() => quizzes.id, { onDelete: "cascade" }),
  questionId: integer("question_id").notNull(),
  selectedIndex: integer("selected_index").notNull(),
  selectedIndices: jsonb("selected_indices").$type<number[] | null>(),
  correct: boolean("correct").notNull(),
  answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Quiz = typeof quizzes.$inferSelect;
export type QuizAnswer = typeof quizAnswers.$inferSelect;
