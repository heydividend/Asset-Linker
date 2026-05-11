import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, gameSessions } from "@workspace/db";
import { getOrCreateSessionId } from "../lib/sessionId";
import { GAMES_CATALOG } from "../lib/gamesCatalog";
import { markPlanItemComplete } from "../lib/planCompletions";

const router: IRouter = Router();

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

router.post("/games/sessions", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const { gameId, score, totalPairs, misses, bestStreak, durationMs } = req.body ?? {};
  if (typeof gameId !== "string" || !gameId) {
    res.status(400).json({ error: "gameId required" });
    return;
  }
  if (!GAMES_CATALOG.some((g) => g.id === gameId)) {
    res.status(400).json({ error: "Unknown gameId" });
    return;
  }
  const safe = {
    score: Math.max(0, Math.floor(Number(score) || 0)),
    totalPairs: Math.max(0, Math.floor(Number(totalPairs) || 0)),
    misses: Math.max(0, Math.floor(Number(misses) || 0)),
    bestStreak: Math.max(0, Math.floor(Number(bestStreak) || 0)),
    durationMs: Math.max(0, Math.floor(Number(durationMs) || 0)),
  };
  const [row] = await db
    .insert(gameSessions)
    .values({ sessionId, gameId, ...safe })
    .returning();
  // Mark the matching daily plan game item complete (idempotent).
  await markPlanItemComplete(sessionId, todayStr(), `game:${gameId}`);
  res.status(201).json(row);
});

router.get("/games/sessions", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const gameId = typeof req.query.gameId === "string" ? req.query.gameId : null;
  const where = gameId
    ? and(eq(gameSessions.sessionId, sessionId), eq(gameSessions.gameId, gameId))
    : eq(gameSessions.sessionId, sessionId);
  const rows = await db
    .select()
    .from(gameSessions)
    .where(where)
    .orderBy(desc(gameSessions.completedAt))
    .limit(50);
  res.json(rows);
});

router.get("/games/summary", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const rows = await db
    .select({
      gameId: gameSessions.gameId,
      plays: sql<number>`cast(count(*) as int)`,
      bestScore: sql<number>`cast(max(${gameSessions.score}) as int)`,
      lastScore: sql<number>`cast((array_agg(${gameSessions.score} order by ${gameSessions.completedAt} desc))[1] as int)`,
      lastPlayedAt: sql<string>`max(${gameSessions.completedAt})`,
    })
    .from(gameSessions)
    .where(eq(gameSessions.sessionId, sessionId))
    .groupBy(gameSessions.gameId);
  res.json(rows);
});

export default router;
