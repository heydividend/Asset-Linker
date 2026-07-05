import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { topics } from "./topics";
import { tasks } from "./tasks";

// A testlet is a shared clinical scenario that several questions hang off of.
// The sub-questions live in the `questions` table with `testletId` pointing here
// and the scenario prefixed into each stem, so they remain self-contained and
// render in every quiz runner without special grouping UI.
export const testlets = pgTable("testlets", {
  id: serial("id").primaryKey(),
  scenario: text("scenario").notNull(),
  domainId: integer("domain_id").references(() => domains.id, { onDelete: "set null" }),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  taskId: integer("task_id").references(() => tasks.id, { onDelete: "set null" }),
  sourceKind: text("source_kind").notNull().default("ai"),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Testlet = typeof testlets.$inferSelect;
