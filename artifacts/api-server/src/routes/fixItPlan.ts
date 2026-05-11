import { Router, type IRouter } from "express";
import { asc, eq } from "drizzle-orm";
import { db, fixItCompletions } from "@workspace/db";
import { getOrCreateSessionId } from "../lib/sessionId";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeStreak(dates: string[]): number {
  if (dates.length === 0) return 0;
  const set = new Set(dates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const cursor = new Date(today);
  if (!set.has(fmt(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!set.has(fmt(cursor))) return 0;
  }
  let streak = 0;
  while (set.has(fmt(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

async function loadStreak(sessionId: string) {
  const rows = await db
    .select({ date: fixItCompletions.date })
    .from(fixItCompletions)
    .where(eq(fixItCompletions.sessionId, sessionId))
    .orderBy(asc(fixItCompletions.date));
  const completedDates = rows.map((r) => r.date);
  const today = todayStr();
  return {
    completedDates,
    streak: computeStreak(completedDates),
    completedToday: completedDates.includes(today),
    today,
  };
}

router.get("/plan/fix-it/streak", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  res.json(await loadStreak(sessionId));
});

router.post("/plan/fix-it/complete", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  // Server time is the source of truth. We deliberately ignore any client-
  // supplied date so users can't backdate / future-date completions to game
  // their streak.
  const date = todayStr();
  // Idempotent: each (sessionId, date) pair is unique. Other sessions remain
  // independent — they each get their own row when they complete the same day.
  await db
    .insert(fixItCompletions)
    .values({ sessionId, date })
    .onConflictDoNothing({
      target: [fixItCompletions.sessionId, fixItCompletions.date],
    });
  res.json(await loadStreak(sessionId));
});

export default router;
