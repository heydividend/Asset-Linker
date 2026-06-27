import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const examSchedule = pgTable("exam_schedule", {
  id: serial("id").primaryKey(),
  // Owning user (Clerk user id). Nullable for the legacy single global row;
  // each user now gets their own schedule row.
  userId: text("user_id"),
  startDate: text("start_date").notNull(),
  examDate: text("exam_date").notNull(),
  examName: text("exam_name").notNull().default("BOC Certification Exam"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ExamSchedule = typeof examSchedule.$inferSelect;
