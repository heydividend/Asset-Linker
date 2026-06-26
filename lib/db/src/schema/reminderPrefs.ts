import {
  pgTable,
  serial,
  text,
  boolean,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Per-session daily study-reminder preference. `time` is "HH:MM" (24h)
// interpreted in the session's chosen `timezone` (an IANA name, e.g.
// "America/New_York"), defaulting to the app's reference timezone
// (America/Los_Angeles, see lib/today.ts). `skippedDays` lists weekdays the
// user has silenced (0=Sunday … 6=Saturday, JS getDay convention) so rest days
// stay quiet. `lastSentDate` is the YYYY-MM-DD (in the user's timezone) of the
// most recent reminder we pushed, used by the scheduler to send at most one
// reminder per day per session.
export const reminderPrefs = pgTable(
  "reminder_prefs",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    enabled: boolean("enabled").notNull().default(false),
    time: text("time").notNull().default("08:00"),
    timezone: text("timezone").notNull().default("America/Los_Angeles"),
    skippedDays: jsonb("skipped_days").$type<number[]>().notNull().default([]),
    lastSentDate: text("last_sent_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    sessionUnique: uniqueIndex("reminder_prefs_session_unique").on(t.sessionId),
  }),
);

export type ReminderPref = typeof reminderPrefs.$inferSelect;
