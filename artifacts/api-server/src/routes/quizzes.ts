import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, questions, quizzes, quizAnswers, topicMastery, taskMastery } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { questionCredit } from "../lib/scoring";
import { getOrCreateSessionId } from "../lib/sessionId";
import { markPlanItemComplete, todayStr } from "../lib/planCompletions";

const router: IRouter = Router();

async function buildQuizQuestionView(qids: number[], answers: Map<number, { selectedIndex: number; selectedIndices: number[] | null; correct: boolean }>) {
  if (qids.length === 0) return [];
  const rows = await db.select().from(questions).where(inArray(questions.id, qids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return qids
    .map((qid) => {
      const q = byId.get(qid);
      if (!q) return null;
      const ans = answers.get(qid);
      return {
        id: qid,
        questionId: qid,
        stem: q.stem,
        imageUrl: q.imageUrl ?? null,
        choices: q.choices,
        topicId: q.topicId,
        domainId: q.domainId,
        sourceKind: q.sourceKind,
        pendingReview: q.pendingReview,
        multiSelect: q.multiSelect,
        ...(ans
          ? {
              selectedIndex: ans.selectedIndex,
              selectedIndices: ans.selectedIndices ?? undefined,
              correctIndex: q.correctIndex,
              correctIndices: q.correctIndices ?? undefined,
              rationale: q.rationale,
              sourceUrl: q.sourceUrl,
            }
          : {}),
      };
    })
    .filter(Boolean);
}

function arraysEqualAsSets(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

router.get("/questions", async (req, res): Promise<void> => {
  const source = typeof req.query.source === "string" ? req.query.source.trim() : "";
  const pendingOnly = req.query.pendingReview === "true" || req.query.pendingReview === "1";
  const conditions = [eq(questions.enabled, true)];
  if (source) conditions.push(eq(questions.sourceKind, source));
  if (pendingOnly) conditions.push(eq(questions.pendingReview, true));
  const rows = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      topicId: questions.topicId,
      domainId: questions.domainId,
      sourceKind: questions.sourceKind,
      pendingReview: questions.pendingReview,
      createdAt: questions.createdAt,
    })
    .from(questions)
    .where(and(...conditions))
    .orderBy(desc(questions.createdAt))
    .limit(200);
  res.json(rows);
});

router.get("/quizzes", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 100);
  const rows = await db.select().from(quizzes).orderBy(desc(quizzes.startedAt)).limit(limit);
  const ids = rows.map((r) => r.id);
  const correctByQuiz = new Map<number, number>();
  if (ids.length > 0) {
    const counts = await db
      .select({
        quizId: quizAnswers.quizId,
        correct: sql<number>`sum(case when ${quizAnswers.correct} then 1 else 0 end)`.as("correct"),
      })
      .from(quizAnswers)
      .where(inArray(quizAnswers.quizId, ids))
      .groupBy(quizAnswers.quizId);
    for (const c of counts) correctByQuiz.set(c.quizId, Number(c.correct) || 0);
  }
  res.json(
    rows.map((r) => ({
      id: r.id,
      mode: r.mode,
      totalQuestions: r.questionIds.length,
      correctCount: correctByQuiz.get(r.id) ?? 0,
      currentIndex: r.currentIndex,
      finished: r.finished,
      score: r.score,
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
    })),
  );
});

router.post("/quizzes", async (req, res): Promise<void> => {
  const { mode = "adaptive", count = 10, notebookId, topicId, topicIds, domainId, taskId, sourceKind, pendingReviewOnly } = req.body ?? {};

  const baseConditions = [eq(questions.enabled, true)];
  if (typeof sourceKind === "string" && sourceKind) {
    baseConditions.push(eq(questions.sourceKind, sourceKind));
  }
  if (pendingReviewOnly === true) {
    baseConditions.push(eq(questions.pendingReview, true));
  }
  if (domainId) baseConditions.push(eq(questions.domainId, domainId));
  // Task-level drill: when a taskId is supplied the quiz is pinned to the
  // questions tagged to that single PA8 task statement. This bypasses the
  // topic-coherence resolution below entirely.
  if (taskId) baseConditions.push(eq(questions.taskId, taskId));
  // "multi_select" mode drills only scenario/multi-answer questions — the exam
  // item type the student struggles with — pulled from across the whole pool
  // (not restricted to a single topic like adaptive/weakness modes).
  if (mode === "multi_select") baseConditions.push(eq(questions.multiSelect, true));

  // Resolve which topic(s) this quiz draws from. Every quiz is topically
  // coherent: adaptive/weakness pick ONE topic (lowest mastery / least
  // attempted) so the user never sees e.g. knee questions mixed in when they
  // expected head injury. Explicit topicId / topicIds still override.
  let resolvedTopicIds: number[] | null = null;
  if (taskId) {
    // Already pinned to a task above — don't also constrain by topic.
    resolvedTopicIds = null;
  } else if (Array.isArray(topicIds) && topicIds.length > 0) {
    resolvedTopicIds = topicIds.filter((n: unknown): n is number => typeof n === "number");
  } else if (topicId) {
    resolvedTopicIds = [topicId];
  } else if (mode === "adaptive" || mode === "weakness") {
    // Pick the single weakest topic that actually has matching questions
    // under the current filters (sourceKind, pendingReview, domain).
    const candidates = await db
      .select({ topicId: questions.topicId })
      .from(questions)
      .where(and(...baseConditions, sql`${questions.topicId} IS NOT NULL`))
      .groupBy(questions.topicId);
    const availableTids = candidates.map((c) => c.topicId).filter(Boolean) as number[];
    if (availableTids.length > 0) {
      const ranked = await db
        .select({ topicId: topicMastery.topicId, mastery: topicMastery.mastery })
        .from(topicMastery)
        .where(inArray(topicMastery.topicId, availableTids))
        .orderBy(topicMastery.mastery);
      const studiedTids = new Set(ranked.map((r) => r.topicId));
      // Prefer never-studied topics first (truly weakest), then lowest mastery.
      const unseen = availableTids.filter((t) => !studiedTids.has(t));
      const pickedTid = unseen.length > 0
        ? unseen[Math.floor(Math.random() * unseen.length)]
        : ranked[0]?.topicId ?? availableTids[Math.floor(Math.random() * availableTids.length)];
      resolvedTopicIds = [pickedTid];
    }
  }

  const conditions = [...baseConditions];
  if (resolvedTopicIds && resolvedTopicIds.length > 0) {
    conditions.push(inArray(questions.topicId, resolvedTopicIds));
  }

  const qrows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(...conditions))
    .orderBy(sql`random()`)
    .limit(count);

  if (qrows.length === 0) {
    res.status(400).json({ error: "No questions available for this selection." });
    return;
  }

  const [quiz] = await db
    .insert(quizzes)
    .values({
      mode,
      notebookId: notebookId ?? null,
      topicId: topicId ?? null,
      domainId: domainId ?? null,
      questionIds: qrows.map((q) => q.id),
    })
    .returning();

  res.status(201).json({
    id: quiz.id,
    mode: quiz.mode,
    questions: await buildQuizQuestionView(quiz.questionIds, new Map()),
    currentIndex: 0,
    finished: false,
  });
});

router.get("/quizzes/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [quiz] = await db.select().from(quizzes).where(eq(quizzes.id, id));
  if (!quiz) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const ans = await db.select().from(quizAnswers).where(eq(quizAnswers.quizId, id));
  const ansMap = new Map(ans.map((a) => [a.questionId, { selectedIndex: a.selectedIndex, selectedIndices: a.selectedIndices, correct: a.correct }]));
  res.json({
    id: quiz.id,
    mode: quiz.mode,
    questions: await buildQuizQuestionView(quiz.questionIds, ansMap),
    currentIndex: quiz.currentIndex,
    finished: quiz.finished,
    score: quiz.score,
  });
});

router.delete("/quizzes/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(quizzes).where(eq(quizzes.id, id));
  res.sendStatus(204);
});

router.post("/quizzes/:id/answer", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { questionId, selectedIndex, selectedIndices } = req.body ?? {};
  if (typeof questionId !== "number") {
    res.status(400).json({ error: "questionId required" });
    return;
  }
  const [q] = await db.select().from(questions).where(eq(questions.id, questionId));
  if (!q) {
    res.status(404).json({ error: "Question not found" });
    return;
  }
  let correct: boolean;
  let storedIndex: number;
  let storedIndices: number[] | null = null;
  if (q.multiSelect && Array.isArray(q.correctIndices)) {
    if (!Array.isArray(selectedIndices)) {
      res.status(400).json({ error: "selectedIndices array required for multi-select question" });
      return;
    }
    const cleaned = selectedIndices.filter((n: unknown): n is number => typeof n === "number");
    storedIndices = cleaned;
    storedIndex = cleaned[0] ?? -1;
    correct = arraysEqualAsSets(cleaned, q.correctIndices);
  } else {
    if (typeof selectedIndex !== "number") {
      res.status(400).json({ error: "selectedIndex required" });
      return;
    }
    storedIndex = selectedIndex;
    correct = selectedIndex === q.correctIndex;
  }
  await db.insert(quizAnswers).values({ quizId: id, questionId, selectedIndex: storedIndex, selectedIndices: storedIndices, correct });
  await db
    .update(quizzes)
    .set({ currentIndex: sql`${quizzes.currentIndex} + 1` })
    .where(eq(quizzes.id, id));

  if (q.topicId) {
    const [existing] = await db
      .select()
      .from(topicMastery)
      .where(eq(topicMastery.topicId, q.topicId));
    if (existing) {
      const attempts = existing.attempts + 1;
      const correctCount = existing.correct + (correct ? 1 : 0);
      await db
        .update(topicMastery)
        .set({ attempts, correct: correctCount, mastery: correctCount / attempts, updatedAt: new Date() })
        .where(eq(topicMastery.topicId, q.topicId));
    } else {
      await db.insert(topicMastery).values({
        topicId: q.topicId,
        attempts: 1,
        correct: correct ? 1 : 0,
        mastery: correct ? 1 : 0,
      });
    }
  }

  // Mirror mastery tracking at the PA8 task level so the Blueprint page shows
  // objective progress per task statement, not just per topic.
  if (q.taskId) {
    const inc = correct ? 1 : 0;
    await db
      .insert(taskMastery)
      .values({ taskId: q.taskId, attempts: 1, correct: inc, mastery: inc })
      .onConflictDoUpdate({
        target: taskMastery.taskId,
        set: {
          attempts: sql`${taskMastery.attempts} + 1`,
          correct: sql`${taskMastery.correct} + ${inc}`,
          mastery: sql`(${taskMastery.correct} + ${inc})::double precision / (${taskMastery.attempts} + 1)`,
          updatedAt: new Date(),
        },
      });
  }

  res.json({
    correct,
    correctIndex: q.correctIndex,
    correctIndices: q.correctIndices ?? undefined,
    multiSelect: q.multiSelect,
    rationale: q.rationale,
    sourceUrl: q.sourceUrl,
  });
});

router.post("/quizzes/:id/finish", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const ans = await db.select().from(quizAnswers).where(eq(quizAnswers.quizId, id));
  // Score with BOC-style partial credit: multi-select answers earn fractional
  // credit (never negative), single-select stays all-or-nothing.
  const qids = ans.map((a) => a.questionId);
  const qrows = qids.length > 0 ? await db.select().from(questions).where(inArray(questions.id, qids)) : [];
  const qById = new Map(qrows.map((q) => [q.id, q]));
  const creditEarned = ans.reduce((sum, a) => {
    const q = qById.get(a.questionId);
    if (!q) return sum;
    return sum + questionCredit(q, q.multiSelect ? (a.selectedIndices ?? []) : a.selectedIndex);
  }, 0);
  const score = ans.length === 0 ? 0 : (creditEarned / ans.length) * 100;
  const [updated] = await db
    .update(quizzes)
    .set({ finished: true, score, finishedAt: new Date() })
    .where(eq(quizzes.id, id))
    .returning();

  // Auto-mark today's quiz plan-items complete. We mark the most-specific key
  // matching this quiz (topicId > domainId > "any") so finishing a targeted
  // quiz checks the targeted plan row, not just the generic one.
  if (updated) {
    const sessionId = getOrCreateSessionId(req, res);
    const date = todayStr();
    if (updated.topicId) {
      await markPlanItemComplete(sessionId, date, `quiz:topic:${updated.topicId}`);
    }
    if (updated.domainId) {
      await markPlanItemComplete(sessionId, date, `quiz:domain:${updated.domainId}`);
    }
    await markPlanItemComplete(sessionId, date, "quiz:any");
  }

  res.json({ id, score, total: ans.length, correct: ans.filter((a) => a.correct).length });
});

export default router;
