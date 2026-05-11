import { boolean, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { topics } from "./topics";

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  stem: text("stem").notNull(),
  choices: jsonb("choices").$type<string[]>().notNull(),
  correctIndex: integer("correct_index").notNull(),
  rationale: text("rationale").notNull(),
  domainId: integer("domain_id").references(() => domains.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  difficulty: integer("difficulty").notNull().default(2),
  sourceKind: text("source_kind").notNull().default("ai"),
  sourceUrl: text("source_url"),
  enabled: boolean("enabled").notNull().default(true),
  pendingReview: boolean("pending_review").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Question = typeof questions.$inferSelect;
