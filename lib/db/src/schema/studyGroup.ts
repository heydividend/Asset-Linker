import { integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { topics } from "./topics";
import { domains } from "./domains";

export const studyGroupSessions = pgTable("study_group_sessions", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  domainId: integer("domain_id").references(() => domains.id, { onDelete: "set null" }),
  focus: text("focus"),
  status: text("status").notNull().default("idle"),
  roundCount: integer("round_count").notNull().default(0),
  pendingExtractionRound: integer("pending_extraction_round"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const studyGroupMessages = pgTable("study_group_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => studyGroupSessions.id, { onDelete: "cascade" }),
  speaker: text("speaker").notNull(), // mentor | alex | jordan | student | system
  kind: text("kind").notNull(), // question | answer | reasoning | verdict | takeaway | interjection | response | system
  content: text("content").notNull(),
  roundIndex: integer("round_index").notNull().default(0),
  questionId: integer("question_id"),
  status: text("status").notNull().default("done"), // pending | streaming | done | failed
  // When the periodic sweeper / startup recovery / takeover flips a stuck
  // 'streaming' row to 'failed', it records 'sweeper_timeout' here so the
  // dashboard can explain WHY the round suddenly went from "thinking…" to
  // "retry" instead of treating it as a generic failure. 'stream_error' is
  // recorded when the model stream errored or returned no content. NULL for
  // normal failures and successes.
  reason: text("reason"),
  turnOrder: integer("turn_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const studyGroupArtifacts = pgTable("study_group_artifacts", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id")
    .notNull()
    .references(() => studyGroupSessions.id, { onDelete: "cascade" }),
  roundIndex: integer("round_index").notNull().default(0),
  kind: text("kind").notNull(), // flashcard_candidate | question_candidate | reasoning_pattern | mastery_signal
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  promotedRefId: integer("promoted_ref_id"),
  promotedAt: timestamp("promoted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type StudyGroupSession = typeof studyGroupSessions.$inferSelect;
export type StudyGroupMessage = typeof studyGroupMessages.$inferSelect;
export type StudyGroupArtifact = typeof studyGroupArtifacts.$inferSelect;
