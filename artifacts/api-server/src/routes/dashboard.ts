import { Router, type IRouter } from "express";
import { desc, eq, sql, lte } from "drizzle-orm";
import {
  db,
  flashcards,
  quizzes,
  quizAnswers,
  topicMastery,
  topics,
  domains,
  mockExams,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [{ totalAns }] = await db
    .select({ totalAns: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers);
  const [{ totalCorr }] = await db
    .select({ totalCorr: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers)
    .where(eq(quizAnswers.correct, true));

  const [{ due }] = await db
    .select({ due: sql<number>`cast(count(*) as int)` })
    .from(flashcards)
    .where(lte(flashcards.dueAt, new Date()));

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
    .slice(0, 6)
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

  const totalAttAll = domainMastery.reduce((s, d) => s + d.total, 0);
  const totalCorrAll = domainMastery.reduce((s, d) => s + d.correct, 0);
  const masteryReadiness =
    totalAttAll === 0 ? 0 : (totalCorrAll / totalAttAll) * 100;
  const lastMock = recentMocks[0]?.scorePercent;
  const readinessScore = Math.round(
    lastMock != null ? masteryReadiness * 0.4 + lastMock * 0.6 : masteryReadiness,
  );

  res.json({
    readinessScore,
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
  });
});

router.get("/dashboard/topic-mastery", async (_req, res): Promise<void> => {
  const mastery = await db.select().from(topicMastery);
  const tRows = await db.select().from(topics);
  const masteryByTopic = new Map(mastery.map((m) => [m.topicId, m]));

  // Last 5 quiz answers per topic (joined via questions.topic_id), newest first.
  const recentRows = (await db.execute(sql`
    SELECT topic_id, correct, answered_at FROM (
      SELECT q.topic_id AS topic_id,
             qa.correct AS correct,
             qa.answered_at AS answered_at,
             ROW_NUMBER() OVER (PARTITION BY q.topic_id ORDER BY qa.answered_at DESC) AS rn
      FROM quiz_answers qa
      JOIN questions q ON q.id = qa.question_id
      WHERE q.topic_id IS NOT NULL
    ) t
    WHERE rn <= 5
    ORDER BY topic_id ASC, answered_at ASC
  `)) as unknown as { rows: Array<{ topic_id: number; correct: boolean; answered_at: string | Date }> };

  const recentByTopic = new Map<number, Array<{ correct: boolean; answeredAt: string }>>();
  for (const row of recentRows.rows) {
    const arr = recentByTopic.get(row.topic_id) ?? [];
    arr.push({
      correct: row.correct,
      answeredAt:
        row.answered_at instanceof Date
          ? row.answered_at.toISOString()
          : new Date(row.answered_at).toISOString(),
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
           qa.answered_at AS answered_at
    FROM quiz_answers qa
    JOIN questions q ON q.id = qa.question_id
    WHERE q.topic_id IS NOT NULL
    ${filterClause}
    ORDER BY q.topic_id ASC, qa.answered_at ASC
  `)) as unknown as {
    rows: Array<{ topic_id: number; correct: boolean; answered_at: string | Date }>;
  };

  const byTopic = new Map<number, Array<{ correct: boolean; answeredAt: string }>>();
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
