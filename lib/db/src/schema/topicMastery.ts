import { doublePrecision, integer, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { topics } from "./topics";

// Scoped per user: one row per (user, topic).
export const topicMastery = pgTable(
  "topic_mastery",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id"),
    topicId: integer("topic_id").notNull().references(() => topics.id, { onDelete: "cascade" }),
    attempts: integer("attempts").notNull().default(0),
    correct: integer("correct").notNull().default(0),
    mastery: doublePrecision("mastery").notNull().default(0.5),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    userTopicUnique: unique("topic_mastery_user_topic_unique").on(t.userId, t.topicId),
  }),
);

export type TopicMastery = typeof topicMastery.$inferSelect;
