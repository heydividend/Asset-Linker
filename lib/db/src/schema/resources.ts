import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { domains } from "./domains";
import { topics } from "./topics";

export const resources = pgTable("resources", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  url: text("url").notNull(),
  kind: text("kind").notNull(),
  provider: text("provider"),
  topicId: integer("topic_id").references(() => topics.id, { onDelete: "set null" }),
  domainId: integer("domain_id").references(() => domains.id, { onDelete: "set null" }),
  notes: text("notes"),
  saved: boolean("saved").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Resource = typeof resources.$inferSelect;
