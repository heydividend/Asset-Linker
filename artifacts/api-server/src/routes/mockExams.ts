import { Router, type IRouter } from "express";
import { desc, eq, inArray, sql } from "drizzle-orm";
import { db, questions, mockExams, domains, topics, topicMastery } from "@workspace/db";
import { parseId } from "../lib/parseId";

const router: IRouter = Router();
const PASS = 75;

router.get("/mock-exams", async (_req, res): Promise<void> => {
  const rows = await db.select().from(mockExams).orderBy(desc(mockExams.startedAt));
  res.json(
    rows.map((r) => ({
      id: r.id,
      totalQuestions: r.totalQuestions,
      timeLimitSec: r.timeLimitSec,
      startedAt: r.startedAt,
      submittedAt: r.submittedAt,
      submitted: r.submitted,
      autoSubmitted: r.autoSubmitted,
      visibilityBreaks: r.visibilityBreaks,
      scorePercent: r.scorePercent,
    })),
  );
});

router.post("/mock-exams", async (req, res): Promise<void> => {
  const { totalQuestions = 175, timeLimitSec = 4 * 60 * 60 } = req.body ?? {};
  // Sample by domain weight
  const domainRows = await db.select().from(domains);
  const totalWeight = domainRows.reduce((s, d) => s + d.weight, 0);
  const picks: number[] = [];
  for (const d of domainRows) {
    const want = Math.round((d.weight / totalWeight) * totalQuestions);
    const got = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.domainId, d.id))
      .orderBy(sql`random()`)
      .limit(want);
    picks.push(...got.map((g) => g.id));
  }
  // Top up if short
  if (picks.length < totalQuestions) {
    const need = totalQuestions - picks.length;
    const more = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.enabled, true))
      .orderBy(sql`random()`)
      .limit(need * 2);
    for (const m of more) {
      if (picks.length >= totalQuestions) break;
      if (!picks.includes(m.id)) picks.push(m.id);
    }
  }
  const finalIds = picks.slice(0, totalQuestions);
  if (finalIds.length === 0) {
    res.status(400).json({ error: "No questions in bank." });
    return;
  }
  const [exam] = await db
    .insert(mockExams)
    .values({
      totalQuestions: finalIds.length,
      timeLimitSec,
      questionIds: finalIds,
      answers: finalIds.map(() => null),
    })
    .returning();
  res.status(201).json(await serializeExam(exam, false));
});

router.get("/mock-exams/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [exam] = await db.select().from(mockExams).where(eq(mockExams.id, id));
  if (!exam) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(await serializeExam(exam, exam.submitted));
});

async function serializeExam(exam: typeof mockExams.$inferSelect, includeAnswers: boolean) {
  const qs = await db.select().from(questions).where(inArray(questions.id, exam.questionIds));
  const byId = new Map(qs.map((q) => [q.id, q]));
  return {
    id: exam.id,
    totalQuestions: exam.totalQuestions,
    timeLimitSec: exam.timeLimitSec,
    startedAt: exam.startedAt,
    submittedAt: exam.submittedAt,
    submitted: exam.submitted,
    autoSubmitted: exam.autoSubmitted,
    visibilityBreaks: exam.visibilityBreaks,
    currentIndex: exam.currentIndex,
    scorePercent: exam.scorePercent,
    questions: exam.questionIds.map((qid, i) => {
      const q = byId.get(qid);
      const sel = exam.answers[i];
      return {
        id: qid,
        questionId: qid,
        stem: q?.stem ?? "",
        choices: q?.choices ?? [],
        topicId: q?.topicId,
        domainId: q?.domainId,
        selectedIndex: sel ?? undefined,
        ...(includeAnswers && q
          ? { correctIndex: q.correctIndex, rationale: q.rationale, sourceUrl: q.sourceUrl }
          : {}),
      };
    }),
  };
}

router.post("/mock-exams/:id/answer", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { index, selectedIndex } = req.body ?? {};
  if (typeof index !== "number" || typeof selectedIndex !== "number") {
    res.status(400).json({ error: "index and selectedIndex required" });
    return;
  }
  const [exam] = await db.select().from(mockExams).where(eq(mockExams.id, id));
  if (!exam) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (exam.submitted) {
    res.status(409).json({ error: "Exam already submitted" });
    return;
  }
  // Server-side timer enforcement: refuse late answers.
  const elapsed = Math.floor((Date.now() - new Date(exam.startedAt).getTime()) / 1000);
  if (elapsed > exam.timeLimitSec) {
    res.status(409).json({ error: "Time has expired. Submit the exam." });
    return;
  }
  // Strict no-back enforcement: only allow answering the current (un-answered) question.
  if (index !== exam.currentIndex) {
    res.status(409).json({ error: "Cannot revisit a previous question." });
    return;
  }
  if (exam.answers[index] != null) {
    res.status(409).json({ error: "Question already answered." });
    return;
  }
  if (index < 0 || index >= exam.questionIds.length) {
    res.status(400).json({ error: "index out of range" });
    return;
  }
  const newAnswers = [...exam.answers];
  newAnswers[index] = selectedIndex;
  await db
    .update(mockExams)
    .set({ answers: newAnswers, currentIndex: index + 1 })
    .where(eq(mockExams.id, id));
  res.sendStatus(204);
});

router.post("/mock-exams/:id/heartbeat", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const event = (req.body?.event ?? "tick") as string;
  if (event === "blur" || event === "hidden") {
    await db
      .update(mockExams)
      .set({ visibilityBreaks: sql`${mockExams.visibilityBreaks} + 1` })
      .where(eq(mockExams.id, id));
  }
  res.sendStatus(204);
});

async function computeResult(examId: number) {
  const [exam] = await db.select().from(mockExams).where(eq(mockExams.id, examId));
  if (!exam) return null;
  const qs = await db.select().from(questions).where(inArray(questions.id, exam.questionIds));
  const byId = new Map(qs.map((q) => [q.id, q]));
  let correct = 0;
  const perDomainStats = new Map<number, { correct: number; total: number }>();
  const perTopicStats = new Map<number, { correct: number; total: number }>();
  exam.questionIds.forEach((qid, i) => {
    const q = byId.get(qid);
    if (!q) return;
    const sel = exam.answers[i];
    const isCorrect = sel === q.correctIndex;
    if (isCorrect) correct += 1;
    if (q.domainId) {
      const cur = perDomainStats.get(q.domainId) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (isCorrect) cur.correct += 1;
      perDomainStats.set(q.domainId, cur);
    }
    if (q.topicId) {
      const cur = perTopicStats.get(q.topicId) ?? { correct: 0, total: 0 };
      cur.total += 1;
      if (isCorrect) cur.correct += 1;
      perTopicStats.set(q.topicId, cur);
    }
  });
  const scorePercent = exam.totalQuestions === 0 ? 0 : (correct / exam.totalQuestions) * 100;
  const dRows = await db.select().from(domains);
  const tRows = await db.select().from(topics);
  const domainBreakdown = Array.from(perDomainStats.entries()).map(([did, s]) => {
    const d = dRows.find((x) => x.id === did);
    return {
      domainId: did,
      code: d?.code ?? "",
      name: d?.name ?? "Unknown",
      correct: s.correct,
      total: s.total,
    };
  });
  const weakTopics = Array.from(perTopicStats.entries())
    .map(([tid, s]) => {
      const t = tRows.find((x) => x.id === tid);
      const mastery = s.total === 0 ? 0 : (s.correct / s.total) * 100;
      return { topicId: tid, name: t?.name ?? "Unknown", mastery, total: s.total };
    })
    .filter((t) => t.mastery < 70 && t.total >= 1)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 8)
    .map(({ topicId, name, mastery }) => ({ topicId, name, mastery }));
  return {
    exam,
    payload: {
      examId,
      scorePercent,
      passed: scorePercent >= PASS,
      correct,
      totalQuestions: exam.totalQuestions,
      autoSubmitted: exam.autoSubmitted,
      visibilityBreaks: exam.visibilityBreaks,
      domainBreakdown,
      weakTopics,
    },
  };
}

router.post("/mock-exams/:id/submit", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [existing] = await db.select().from(mockExams).where(eq(mockExams.id, id));
  if (!existing) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Server-authoritative auto-submit: if the timer has expired, treat as auto regardless of client.
  const elapsed = Math.floor((Date.now() - new Date(existing.startedAt).getTime()) / 1000);
  const timeExpired = elapsed > existing.timeLimitSec;
  const clientAuto =
    req.body?.auto === true ||
    req.query?.auto === "true" ||
    req.query?.auto === "1";
  const auto = clientAuto || timeExpired;

  if (!existing.submitted) {
    await db
      .update(mockExams)
      .set({ submitted: true, autoSubmitted: auto, submittedAt: new Date() })
      .where(eq(mockExams.id, id));
  }

  const computed = await computeResult(id);
  if (!computed) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!existing.submitted) {
    await db
      .update(mockExams)
      .set({ scorePercent: computed.payload.scorePercent })
      .where(eq(mockExams.id, id));
  }
  res.json(computed.payload);
});

router.get("/mock-exams/:id/result", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const computed = await computeResult(id);
  if (!computed) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (!computed.exam.submitted) {
    res.status(409).json({ error: "Exam has not been submitted." });
    return;
  }
  res.json(computed.payload);
});

export default router;
