import {
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// A Web Push subscription for a single browser, scoped to an anonymous
// session (boc_sid cookie). One session can have several subscriptions
// (e.g. laptop + phone). The endpoint URL is globally unique per browser,
// so we dedupe on it.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull(),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    endpointUnique: uniqueIndex("push_subscriptions_endpoint_unique").on(
      t.endpoint,
    ),
  }),
);

export type PushSubscription = typeof pushSubscriptions.$inferSelect;
