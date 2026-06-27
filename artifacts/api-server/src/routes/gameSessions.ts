import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, gameSessions, questions, domains } from "@workspace/db";
import { getOrCreateSessionId } from "../lib/sessionId";
import { GAMES_CATALOG } from "../lib/gamesCatalog";
import { markPlanItemComplete } from "../lib/planCompletions";

const router: IRouter = Router();

// Lightweight question sampler for the question-driven games (Code Blue,
// Survivor). Returns enabled questions, optionally filtered to a domain and to
// single-answer items, in random order. Read-only; client scores locally.
router.get("/games/questions", async (req, res): Promise<void> => {
  const domainCode = typeof req.query.domain === "string" ? req.query.domain.toUpperCase() : null;
  const limit = Math.max(1, Math.min(60, Number(req.query.limit) || 20));
  const singleOnly = req.query.single === "1" || req.query.single === "true";

  const dRows = await db.select().from(domains);
  const domainId = domainCode ? dRows.find((d) => d.code === domainCode)?.id ?? -1 : null;
  const codeById = new Map(dRows.map((d) => [d.id, d.code]));

  const conds = [eq(questions.enabled, true)];
  if (domainId != null) conds.push(eq(questions.domainId, domainId));
  if (singleOnly) conds.push(eq(questions.multiSelect, false));
  // mode=contraindication → only items whose stem asks for the contraindicated /
  // inappropriate option (the "Spot the Contraindication" game's content).
  if (req.query.mode === "contraindication") {
    conds.push(
      sql`(lower(${questions.stem}) LIKE '%contraindicat%' OR lower(${questions.stem}) LIKE '%inappropriate%' OR lower(${questions.stem}) LIKE '%not appropriate%' OR lower(${questions.stem}) LIKE '%should not%' OR lower(${questions.stem}) LIKE '%avoid%')`,
    );
  }

  const rows = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      choices: questions.choices,
      correctIndex: questions.correctIndex,
      correctIndices: questions.correctIndices,
      multiSelect: questions.multiSelect,
      rationale: questions.rationale,
      domainId: questions.domainId,
    })
    .from(questions)
    .where(and(...conds))
    .orderBy(sql`random()`)
    .limit(limit);

  res.json(
    rows.map((r) => ({
      id: r.id,
      stem: r.stem,
      choices: r.choices,
      correctIndex: r.correctIndex,
      correctIndices: r.correctIndices,
      multiSelect: r.multiSelect,
      rationale: r.rationale,
      domain: r.domainId != null ? codeById.get(r.domainId) ?? null : null,
    })),
  );
});

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// Auto-check the matching daily plan game item when a game session is recorded.
// markPlanItemComplete is idempotent, so replaying the same game (or a later
// manual mark complete) won't double-count. Extracted from the handler so the
// key derivation can be tested.
export async function linkGameSessionToPlan(
  sessionId: string,
  date: string,
  gameId: string,
): Promise<string> {
  const key = `game:${gameId}`;
  await markPlanItemComplete(sessionId, date, key);
  return key;
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
  // Mark the matching daily plan game item complete (see linkGameSessionToPlan).
  await linkGameSessionToPlan(sessionId, todayStr(), gameId);
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
