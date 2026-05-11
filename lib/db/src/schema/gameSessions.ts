import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const gameSessions = pgTable("game_sessions", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull(),
  gameId: text("game_id").notNull(),
  score: integer("score").notNull(),
  totalPairs: integer("total_pairs").notNull(),
  misses: integer("misses").notNull().default(0),
  bestStreak: integer("best_streak").notNull().default(0),
  durationMs: integer("duration_ms").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }).defaultNow().notNull(),
});

export type GameSession = typeof gameSessions.$inferSelect;
