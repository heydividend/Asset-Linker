import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, questions, mockExams, domains, topics, topicMastery } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { questionCredit } from "../lib/scoring";
import { getOrCreateSessionId } from "../lib/sessionId";
import { markPlanItemComplete, todayStr } from "../lib/planCompletions";
import { mockPlanItemKeyForDay, earliestUncompletedPastMockKey } from "../lib/planSchedule";

const router: IRouter = Router();
const PASS = 75;

// Link a submitted mock to the matching day's plan item. When `date` is a
// scheduled simulated-exam day, auto-check that day's `mock_exam:<date>` plan
// item and return its key; otherwise record nothing and return null.
// markPlanItemComplete is idempotent, so a later manual "mark complete" tap
// won't double-count. Days that aren't simulated-exam days are left alone so a
// genuinely skipped mock keeps carrying forward. Extracted from the submit
// handler so the linking can be exercised with a controlled date in tests.
export async function linkMockSubmissionToPlan(
  sessionId: string,
  date: string,
): Promise<string | null> {
  const mockKey = await mockPlanItemKeyForDay(date);
  if (mockKey) {
    await markPlanItemComplete(sessionId, date, mockKey);
  }
  return mockKey;
}

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
      .where(and(eq(questions.domainId, d.id), eq(questions.enabled, true)))
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
      const selectedIndex = typeof sel === "number" ? sel : undefined;
      const selectedIndices = Array.isArray(sel) ? sel : undefined;
      return {
        id: qid,
        questionId: qid,
        stem: q?.stem ?? "",
        imageUrl: q?.imageUrl ?? null,
        choices: q?.choices ?? [],
        topicId: q?.topicId,
        domainId: q?.domainId,
        multiSelect: q?.multiSelect ?? false,
        selectedIndex,
        selectedIndices,
        ...(includeAnswers && q
          ? {
              correctIndex: q.correctIndex,
              correctIndices: q.correctIndices ?? undefined,
              rationale: q.rationale,
              sourceUrl: q.sourceUrl,
            }
          : {}),
      };
    }),
  };
}

router.delete("/mock-exams/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(mockExams).where(eq(mockExams.id, id));
  res.sendStatus(204);
});

router.post("/mock-exams/:id/answer", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { index, selectedIndex, selectedIndices } = req.body ?? {};
  if (typeof index !== "number") {
    res.status(400).json({ error: "index required" });
    return;
  }
  const hasSingle = typeof selectedIndex === "number";
  const hasMulti = Array.isArray(selectedIndices);
  if (!hasSingle && !hasMulti) {
    res.status(400).json({ error: "selectedIndex or selectedIndices required" });
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
  const elapsed = Math.floor((Date.now() - new Date(exam.startedAt).getTime()) / 1000);
  if (elapsed > exam.timeLimitSec) {
    res.status(409).json({ error: "Time has expired. Submit the exam." });
    return;
  }
  if (index < 0 || index >= exam.questionIds.length) {
    res.status(400).json({ error: "index out of range" });
    return;
  }
  // Free navigation: the user may revisit any question and overwrite a prior
  // answer at any time before submitting. Update only the single answer slot
  // (via jsonb_set) and advance currentIndex with GREATEST in the same
  // statement so concurrent saves to different questions can't clobber each
  // other or regress the furthest-reached index.
  const value = hasMulti
    ? (selectedIndices as unknown[]).filter((n): n is number => typeof n === "number")
    : (selectedIndex as number);
  await db
    .update(mockExams)
    .set({
      answers: sql`jsonb_set(${mockExams.answers}, ${`{${index}}`}, ${JSON.stringify(value)}::jsonb, true)`,
      currentIndex: sql`GREATEST(${mockExams.currentIndex}, ${index + 1})`,
    })
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
  // Credit per question is in [0, 1]: single-select is all-or-nothing, while
  // multi-select earns BOC-style partial credit (never negative). The overall
  // score and the domain/topic breakdowns all accumulate this fractional credit.
  let correct = 0;
  const perDomainStats = new Map<number, { correct: number; total: number }>();
  const perTopicStats = new Map<number, { correct: number; total: number }>();
  exam.questionIds.forEach((qid, i) => {
    const q = byId.get(qid);
    if (!q) return;
    const sel = exam.answers[i];
    const credit = questionCredit(q, sel as number | number[] | null);
    correct += credit;
    if (q.domainId) {
      const cur = perDomainStats.get(q.domainId) ?? { correct: 0, total: 0 };
      cur.total += 1;
      cur.correct += credit;
      perDomainStats.set(q.domainId, cur);
    }
    if (q.topicId) {
      const cur = perTopicStats.get(q.topicId) ?? { correct: 0, total: 0 };
      cur.total += 1;
      cur.correct += credit;
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

    // Link this submission to the matching day's plan item (see
    // linkMockSubmissionToPlan for the auto-check + idempotency contract).
    const sessionId = getOrCreateSessionId(req, res);
    const today = todayStr();
    const mockKey = await linkMockSubmissionToPlan(sessionId, today);
    if (!mockKey) {
      // Make-up mock: today isn't itself a scheduled simulated-exam day, so
      // count this submission toward the earliest still-uncompleted past mock,
      // clearing its carried-forward `mock_exam:<date>` item. The lookup uses
      // the through-today completion set and markPlanItemComplete is
      // idempotent, so this never double-counts a mock already cleared by a
      // manual "mark complete" tap or an earlier make-up.
      const makeupKey = await earliestUncompletedPastMockKey(sessionId, today);
      if (makeupKey) {
        await markPlanItemComplete(sessionId, today, makeupKey);
      }
    }
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
