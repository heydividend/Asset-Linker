import { Router, type IRouter } from "express";
import { desc, eq, sql, lte, gte, and } from "drizzle-orm";
import {
  db,
  flashcards,
  quizzes,
  quizAnswers,
  topicMastery,
  topics,
  domains,
  mockExams,
  studyGuides,
  audioOverviews,
  gameSessions,
  notes,
  notebooks,
} from "@workspace/db";
import { getOrCreateSessionId } from "../lib/sessionId";

const router: IRouter = Router();

import { startOfTodayPT } from "../lib/today";

function startOfTodayUtc(): Date {
  // Name kept for back-compat; semantics are now "start of today in Pacific"
  // so the dashboard "today" counters roll over at PT midnight, matching the
  // rest of the plan/schedule logic.
  return startOfTodayPT();
}

router.get("/dashboard/summary", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const [{ totalAns }] = await db
    .select({ totalAns: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers);
  const [{ totalCorr }] = await db
    .select({ totalCorr: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers)
    .where(eq(quizAnswers.correct, true));

  const now = new Date();
  const [{ due }] = await db
    .select({ due: sql<number>`cast(count(*) as int)` })
    .from(flashcards)
    .where(lte(flashcards.dueAt, now));

  // Per-domain flashcard counts (total + how many are due right now), grouped
  // via the topic each card is tagged with. Cards with no topic (or a topic
  // not linked to a domain) are excluded — those wouldn't show up in the
  // Domain Mastery deep-link review either.
  const flashcardCountRows = (await db.execute(sql`
    SELECT t.domain_id AS domain_id,
           CAST(COUNT(*) AS int) AS total,
           CAST(SUM(CASE WHEN f.due_at <= ${now} THEN 1 ELSE 0 END) AS int) AS due
    FROM flashcards f
    JOIN topics t ON t.id = f.topic_id
    GROUP BY t.domain_id
  `)) as unknown as {
    rows: Array<{ domain_id: number; total: number; due: number }>;
  };
  const flashcardCountByDomain = new Map<number, { total: number; due: number }>();
  for (const row of flashcardCountRows.rows) {
    flashcardCountByDomain.set(row.domain_id, {
      total: Number(row.total) || 0,
      due: Number(row.due) || 0,
    });
  }

  const recentQuizzes = await db
    .select()
    .from(quizzes)
    .orderBy(desc(quizzes.startedAt))
    .limit(5);

  const recentMocks = await db
    .select()
    .from(mockExams)
    .where(eq(mockExams.submitted, true))
    .orderBy(desc(mockExams.submittedAt))
    .limit(3);

  const mastery = await db.select().from(topicMastery);
  const tRows = await db.select().from(topics);
  const dRows = await db.select().from(domains);

  const weakTopics = mastery
    .filter((m) => m.attempts >= 2 && m.mastery < 0.7)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 50)
    .map((m) => {
      const t = tRows.find((x) => x.id === m.topicId);
      return {
        topicId: m.topicId,
        name: t?.name ?? "Unknown",
        mastery: m.mastery,
      };
    });

  const domainMastery = dRows.map((d) => {
    const tIds = tRows.filter((t) => t.domainId === d.id).map((t) => t.id);
    const ms = mastery.filter((m) => tIds.includes(m.topicId));
    const totalAtt = ms.reduce((s, m) => s + m.attempts, 0);
    const totalC = ms.reduce((s, m) => s + m.correct, 0);
    return {
      domainId: d.id,
      code: d.code,
      name: d.name,
      correct: totalC,
      total: totalAtt,
    };
  });

  // Blueprint-weighted knowledge: each domain contributes in proportion to its
  // share of the real BOC exam (domain.weight), and a domain with no attempts
  // counts as 0. This stops one heavily-drilled domain from masking the others
  // and makes the number mirror the actual exam's domain mix — so you can't be
  // "ready" until you're competent across all five weighted domains.
  const weightById = new Map(dRows.map((d) => [d.id, d.weight]));
  const masteryReadiness =
    domainMastery.reduce((s, d) => {
      const w = weightById.get(d.domainId) ?? 0;
      const pct = d.total > 0 ? d.correct / d.total : 0;
      return s + w * pct;
    }, 0) * 100;
  const lastMock = recentMocks[0]?.scorePercent;
  const readinessBaseScore = Math.round(
    lastMock != null ? masteryReadiness * 0.4 + lastMock * 0.6 : masteryReadiness,
  );

  // Recent (7-day) study-activity counts for the dashboard's activity stats.
  // These are shown to the user but deliberately do NOT feed the readiness
  // score (see below), so progress can't be inflated with busywork.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const todayStart = startOfTodayUtc();
  const [{ guidesAll }] = await db
    .select({ guidesAll: sql<number>`cast(count(*) as int)` })
    .from(studyGuides);
  const [{ guides7d }] = await db
    .select({ guides7d: sql<number>`cast(count(*) as int)` })
    .from(studyGuides)
    .where(gte(studyGuides.createdAt, sevenDaysAgo));
  const guidesWithPodcastRes = (await db.execute(sql`
    SELECT CAST(COUNT(DISTINCT sg.id) AS int) AS "guidesWithPodcast"
    FROM study_guides sg
    JOIN audio_overviews ao ON ao.study_guide_id = sg.id
    WHERE ao.status = 'ready'
  `)) as unknown as { rows: Array<{ guidesWithPodcast: number }> };
  const guidesWithPodcast = Number(guidesWithPodcastRes.rows[0]?.guidesWithPodcast ?? 0);
  const [{ gamesAll }] = await db
    .select({ gamesAll: sql<number>`cast(count(*) as int)` })
    .from(gameSessions)
    .where(eq(gameSessions.sessionId, sessionId));
  const [{ gamesToday }] = await db
    .select({ gamesToday: sql<number>`cast(count(*) as int)` })
    .from(gameSessions)
    .where(and(eq(gameSessions.sessionId, sessionId), gte(gameSessions.completedAt, todayStart)));
  const [{ games7d }] = await db
    .select({ games7d: sql<number>`cast(count(*) as int)` })
    .from(gameSessions)
    .where(and(eq(gameSessions.sessionId, sessionId), gte(gameSessions.completedAt, sevenDaysAgo)));

  // Readiness reflects demonstrated knowledge only (blueprint-weighted mastery
  // blended with recent mock-exam performance). It is intentionally NOT padded
  // by study-activity volume, so it can never read "ready" without the mastery
  // and mock scores to back it up. Bonus kept at 0 for response compatibility.
  const readinessBonus = 0;
  const readinessScore = readinessBaseScore;

  // Continue learning: latest 5 touched items across notes / guides / ready
  // podcasts / game sessions, deduped per kind+id and sorted newest-first.
  const recentNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      notebookId: notes.notebookId,
      notebookTitle: notebooks.title,
      createdAt: notes.createdAt,
    })
    .from(notes)
    .innerJoin(notebooks, eq(notebooks.id, notes.notebookId))
    .orderBy(desc(notes.createdAt))
    .limit(30);
  const recentGuides = await db
    .select({
      id: studyGuides.id,
      title: studyGuides.title,
      notebookId: studyGuides.notebookId,
      notebookTitle: notebooks.title,
      createdAt: studyGuides.createdAt,
    })
    .from(studyGuides)
    .innerJoin(notebooks, eq(notebooks.id, studyGuides.notebookId))
    .orderBy(desc(studyGuides.createdAt))
    .limit(30);
  const recentPodcasts = await db
    .select({
      id: audioOverviews.id,
      title: audioOverviews.title,
      notebookId: audioOverviews.notebookId,
      studyGuideId: audioOverviews.studyGuideId,
      createdAt: audioOverviews.createdAt,
    })
    .from(audioOverviews)
    .where(eq(audioOverviews.status, "ready"))
    .orderBy(desc(audioOverviews.createdAt))
    .limit(30);
  const recentGames = await db
    .select({
      gameId: gameSessions.gameId,
      score: gameSessions.score,
      totalPairs: gameSessions.totalPairs,
      completedAt: gameSessions.completedAt,
    })
    .from(gameSessions)
    .where(eq(gameSessions.sessionId, sessionId))
    .orderBy(desc(gameSessions.completedAt))
    .limit(30);

  type CL = {
    kind: "note" | "study_guide" | "podcast" | "game";
    title: string;
    subtitle: string | null;
    link: string;
    lastTouchedAt: string;
  };
  const continueLearning: CL[] = [
    ...recentNotes.map((n) => ({
      kind: "note" as const,
      title: n.title,
      subtitle: n.notebookTitle,
      link: `/notebooks/${n.notebookId}`,
      lastTouchedAt: n.createdAt.toISOString(),
    })),
    ...recentGuides.map((g) => ({
      kind: "study_guide" as const,
      title: g.title,
      subtitle: g.notebookTitle,
      link: `/study-guides/${g.id}`,
      lastTouchedAt: g.createdAt.toISOString(),
    })),
    ...recentPodcasts.map((p) => ({
      kind: "podcast" as const,
      title: p.title,
      subtitle: p.studyGuideId ? "Podcast" : "Audio overview",
      link: p.studyGuideId
        ? `/study-guides/${p.studyGuideId}`
        : `/notebooks/${p.notebookId}`,
      lastTouchedAt: p.createdAt.toISOString(),
    })),
    ...recentGames.map((g) => ({
      kind: "game" as const,
      title: `Game: ${g.gameId}`,
      subtitle: `Score ${g.score}/${g.totalPairs}`,
      link: `/games/${g.gameId}`,
      lastTouchedAt: g.completedAt.toISOString(),
    })),
  ]
    .sort((a, b) => b.lastTouchedAt.localeCompare(a.lastTouchedAt))
    .slice(0, 30);

  res.json({
    readinessScore,
    readinessBaseScore,
    readinessBonus,
    lastUpdated: new Date().toISOString(),
    totalQuestionsAnswered: totalAns,
    totalCorrect: totalCorr,
    streakDays: 1,
    dueFlashcards: due,
    nextMockEta: null,
    recentQuizzes: recentQuizzes.map((q) => {
      const total = (q.questionIds as number[] | null)?.length ?? 0;
      const correctCount = q.score != null ? Math.round((q.score / 100) * total) : 0;
      return {
        id: q.id,
        mode: q.mode,
        totalQuestions: total,
        correctCount,
        finishedAt: q.finishedAt ? q.finishedAt.toISOString() : null,
      };
    }),
    weakTopics,
    domainMastery,
    domainFlashcardCounts: dRows.map((d) => {
      const c = flashcardCountByDomain.get(d.id);
      return { domainId: d.id, total: c?.total ?? 0, due: c?.due ?? 0 };
    }),
    studyGuides: {
      total: Number(guidesAll) || 0,
      withPodcast: Number(guidesWithPodcast) || 0,
      recent7d: Number(guides7d) || 0,
    },
    games: {
      lifetime: Number(gamesAll) || 0,
      today: Number(gamesToday) || 0,
      recent7d: Number(games7d) || 0,
    },
    continueLearning,
  });
});

router.get("/dashboard/topic-mastery", async (req, res): Promise<void> => {
  const rawLimit = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : NaN;
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(20, rawLimit)) : 5;

  const mastery = await db.select().from(topicMastery);
  const tRows = await db.select().from(topics);
  const masteryByTopic = new Map(mastery.map((m) => [m.topicId, m]));

  // Last `limit` quiz answers per topic (joined via questions.topic_id), newest first.
  const recentRows = (await db.execute(sql`
    SELECT topic_id, correct, answered_at, quiz_id, question_id FROM (
      SELECT q.topic_id AS topic_id,
             qa.correct AS correct,
             qa.answered_at AS answered_at,
             qa.quiz_id AS quiz_id,
             qa.question_id AS question_id,
             ROW_NUMBER() OVER (PARTITION BY q.topic_id ORDER BY qa.answered_at DESC) AS rn
      FROM quiz_answers qa
      JOIN questions q ON q.id = qa.question_id
      WHERE q.topic_id IS NOT NULL
    ) t
    WHERE rn <= ${limit}
    ORDER BY topic_id ASC, answered_at ASC
  `)) as unknown as { rows: Array<{ topic_id: number; correct: boolean; answered_at: string | Date; quiz_id: number; question_id: number }> };

  const recentByTopic = new Map<number, Array<{ correct: boolean; answeredAt: string; quizId: number; questionId: number }>>();
  for (const row of recentRows.rows) {
    const arr = recentByTopic.get(row.topic_id) ?? [];
    arr.push({
      correct: row.correct,
      answeredAt:
        row.answered_at instanceof Date
          ? row.answered_at.toISOString()
          : new Date(row.answered_at).toISOString(),
      quizId: row.quiz_id,
      questionId: row.question_id,
    });
    recentByTopic.set(row.topic_id, arr);
  }

  const result = tRows.map((t) => {
    const m = masteryByTopic.get(t.id);
    return {
      topicId: t.id,
      name: t.name,
      mastery: m?.mastery ?? 0,
      attempts: m?.attempts ?? 0,
      correct: m?.correct ?? 0,
      recentAttempts: recentByTopic.get(t.id) ?? [],
    };
  });
  res.json(result);
});

router.get("/dashboard/topic-history", async (req, res): Promise<void> => {
  const raw = typeof req.query.topicIds === "string" ? req.query.topicIds : "";
  const requested = raw
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n));

  const filterClause = requested.length
    ? sql`AND q.topic_id IN (${sql.join(requested.map((n) => sql`${n}`), sql`, `)})`
    : sql``;

  const rows = (await db.execute(sql`
    SELECT q.topic_id AS topic_id,
           qa.correct AS correct,
           qa.answered_at AS answered_at,
           qa.quiz_id AS quiz_id,
           qa.question_id AS question_id
    FROM quiz_answers qa
    JOIN questions q ON q.id = qa.question_id
    WHERE q.topic_id IS NOT NULL
    ${filterClause}
    ORDER BY q.topic_id ASC, qa.answered_at ASC
  `)) as unknown as {
    rows: Array<{ topic_id: number; correct: boolean; answered_at: string | Date; quiz_id: number; question_id: number }>;
  };

  const byTopic = new Map<number, Array<{ correct: boolean; answeredAt: string; quizId: number; questionId: number }>>();
  const ensureTopic = (id: number) => {
    if (!byTopic.has(id)) byTopic.set(id, []);
    return byTopic.get(id)!;
  };
  for (const id of requested) ensureTopic(id);
  for (const row of rows.rows) {
    ensureTopic(row.topic_id).push({
      correct: row.correct,
      answeredAt:
        row.answered_at instanceof Date
          ? row.answered_at.toISOString()
          : new Date(row.answered_at).toISOString(),
      quizId: row.quiz_id,
      questionId: row.question_id,
    });
  }

  res.json(
    Array.from(byTopic.entries()).map(([topicId, attempts]) => ({
      topicId,
      attempts,
    })),
  );
});

export default router;
