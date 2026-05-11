import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { domains } from "./domains";

export const topics = pgTable("topics", {
  id: serial("id").primaryKey(),
  domainId: integer("domain_id").notNull().references(() => domains.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
});

export type Topic = typeof topics.$inferSelect;
