import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const notebooks = pgTable("notebooks", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Notebook = typeof notebooks.$inferSelect;
