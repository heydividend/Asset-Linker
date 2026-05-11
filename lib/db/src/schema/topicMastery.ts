import { doublePrecision, integer, pgTable, serial, timestamp } from "drizzle-orm/pg-core";
import { topics } from "./topics";

export const topicMastery = pgTable("topic_mastery", {
  id: serial("id").primaryKey(),
  topicId: integer("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }).unique(),
  attempts: integer("attempts").notNull().default(0),
  correct: integer("correct").notNull().default(0),
  mastery: doublePrecision("mastery").notNull().default(0.5),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TopicMastery = typeof topicMastery.$inferSelect;
