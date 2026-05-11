import { pgTable, serial, text, doublePrecision } from "drizzle-orm/pg-core";

export const domains = pgTable("domains", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  weight: doublePrecision("weight").notNull(),
});

export type Domain = typeof domains.$inferSelect;
