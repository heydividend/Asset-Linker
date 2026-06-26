import { pgTable, serial, integer, text, timestamp, unique } from "drizzle-orm/pg-core";

// Daily snapshot of the honest BOC readiness score (blueprint-weighted mastery
// blended with mock-exam performance — no activity padding). One row per
// Pacific calendar day; re-computed/upserted on each dashboard load so the
// stored value always reflects the latest reading for that day. Powers the
// readiness trend line on the dashboard.
export const readinessSnapshots = pgTable(
  "readiness_snapshots",
  {
    id: serial("id").primaryKey(),
    // Pacific calendar day (YYYY-MM-DD), matching the rest of the plan/schedule
    // date handling so "today" rolls over at PT midnight.
    snapshotDate: text("snapshot_date").notNull(),
    score: integer("score").notNull(),
    baseScore: integer("base_score").notNull(),
    goalMin: integer("goal_min").notNull(),
    goalMax: integer("goal_max").notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    snapshotDateUnique: unique("readiness_snapshots_snapshot_date_unique").on(t.snapshotDate),
  }),
);

export type ReadinessSnapshot = typeof readinessSnapshots.$inferSelect;
