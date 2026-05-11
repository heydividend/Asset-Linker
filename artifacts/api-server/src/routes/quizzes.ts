import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, questions, quizzes, quizAnswers, topicMastery } from "@workspace/db";
import { parseId } from "../lib/parseId";

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
        choices: q.choices,
        topicId: q.topicId,
        domainId: q.domainId,
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
  const { mode = "adaptive", count = 10, notebookId, topicId, topicIds, domainId } = req.body ?? {};

  const conditions = [eq(questions.enabled, true)];
  if (Array.isArray(topicIds) && topicIds.length > 0) {
    conditions.push(inArray(questions.topicId, topicIds));
  } else if (topicId) {
    conditions.push(eq(questions.topicId, topicId));
  }
  if (domainId) conditions.push(eq(questions.domainId, domainId));

  let qrows = await db
    .select({ id: questions.id })
    .from(questions)
    .where(and(...conditions))
    .orderBy(sql`random()`)
    .limit(count);

  if (mode === "weakness") {
    const weak = await db
      .select({ topicId: topicMastery.topicId })
      .from(topicMastery)
      .orderBy(topicMastery.mastery)
      .limit(5);
    const tids = weak.map((w) => w.topicId).filter(Boolean) as number[];
    if (tids.length > 0) {
      qrows = await db
        .select({ id: questions.id })
        .from(questions)
        .where(and(eq(questions.enabled, true), inArray(questions.topicId, tids)))
        .orderBy(sql`random()`)
        .limit(count);
    }
  }

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
  const score = ans.length === 0 ? 0 : (ans.filter((a) => a.correct).length / ans.length) * 100;
  await db
    .update(quizzes)
    .set({ finished: true, score, finishedAt: new Date() })
    .where(eq(quizzes.id, id));
  res.json({ id, score, total: ans.length, correct: ans.filter((a) => a.correct).length });
});

export default router;
