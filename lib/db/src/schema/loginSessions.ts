import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

// One row per login session (keyed by the Clerk session id). The web client
// posts a heartbeat when the signed-in app mounts; the backend upserts by
// `clerkSessionId`, refreshing `lastSeenAt`. Powers the admin dashboard's
// "login sessions" view and per-user "last active" timestamps.
export const loginSessions = pgTable(
  "login_sessions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    clerkSessionId: text("clerk_session_id").notNull(),
    email: text("email"),
    userAgent: text("user_agent"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    clerkSessionUnique: unique("login_sessions_clerk_session_unique").on(
      t.clerkSessionId,
    ),
  }),
);

export type LoginSession = typeof loginSessions.$inferSelect;
