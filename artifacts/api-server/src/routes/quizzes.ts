import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, questions, quizzes, quizAnswers, topicMastery, taskMastery } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { questionCredit, questionRowCredit, arraysEqual } from "../lib/scoring";
import { getOrCreateSessionId } from "../lib/sessionId";
import { markPlanItemComplete, todayStr } from "../lib/planCompletions";
import { dateStrPT, todayStrPT } from "../lib/today";
import { getOrCreateDailyQuestionIds, clearTodayDailySet } from "../lib/dailyQuiz";

const router: IRouter = Router();

// A valid choice permutation for a question is a full rearrangement of
// [0..n-1] (every original index appears exactly once). We validate before
// applying so a malformed/stale order can never drop or duplicate choices.
function isValidOrder(order: unknown, choiceCount: number): order is number[] {
  if (!Array.isArray(order) || order.length !== choiceCount) return false;
  const seen = new Set<number>();
  for (const v of order) {
    if (typeof v !== "number" || v < 0 || v >= choiceCount || seen.has(v)) return false;
    seen.add(v);
  }
  return true;
}

async function buildQuizQuestionView(
  qids: number[],
  answers: Map<number, { selectedIndex: number; selectedIndices: number[] | null; correct: boolean }>,
  choiceOrders?: Record<string, number[]> | null,
) {
  if (qids.length === 0) return [];
  const rows = await db.select().from(questions).where(inArray(questions.id, qids));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return qids
    .map((qid) => {
      const q = byId.get(qid);
      if (!q) return null;
      const ans = answers.get(qid);
      // displayedPosition -> originalChoiceIndex. Identity when no (valid) order.
      const rawOrder = choiceOrders?.[String(qid)];
      const order = isValidOrder(rawOrder, q.choices.length) ? rawOrder : null;
      // Map an ORIGINAL choice index to the position it is shown at.
      const toDisplayed = (o: number) => (order ? order.indexOf(o) : o);
      const choices = order ? order.map((o) => q.choices[o]) : q.choices;
      return {
        id: qid,
        questionId: qid,
        stem: q.stem,
        imageUrl: q.imageUrl ?? null,
        choices,
        topicId: q.topicId,
        domainId: q.domainId,
        sourceKind: q.sourceKind,
        pendingReview: q.pendingReview,
        multiSelect: q.multiSelect,
        itemType: q.itemType,
        ...(ans
          ? {
              selectedIndex: toDisplayed(ans.selectedIndex),
              selectedIndices: ans.selectedIndices ? ans.selectedIndices.map(toDisplayed) : undefined,
              correctIndex: q.correctIndex != null ? toDisplayed(q.correctIndex) : q.correctIndex,
              correctIndices: q.correctIndices ? q.correctIndices.map(toDisplayed) : undefined,
              rationale: q.rationale,
              sourceUrl: q.sourceUrl,
              // Ordering items are never choice-shuffled, so their sequences are
              // reported as raw choice indices (no toDisplayed translation).
              ...(q.itemType === "ordering"
                ? {
                    correctOrder: q.correctOrder ?? undefined,
                    selectedOrder: ans.selectedIndices ?? undefined,
                  }
                : {}),
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
  const userId = getOrCreateSessionId(req, res);
  const limit = Math.min(parseInt((req.query.limit as string) ?? "20", 10) || 20, 100);
  const rows = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.userId, userId))
    .orderBy(desc(quizzes.startedAt))
    .limit(limit);
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
  const userId = getOrCreateSessionId(req, res);
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
        .where(and(eq(topicMastery.userId, userId), inArray(topicMastery.topicId, availableTids)))
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
      userId,
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

// The 50-question original BOC-style daily quiz. The day's questions are
// generated fresh (AI, PA8-aligned, weak-area weighted) and cached so the set
// is stable within the day and regenerates the next day. Resumes today's
// unfinished daily attempt if one exists, otherwise starts a new one.
router.post("/quizzes/daily", async (req, res): Promise<void> => {
  const userId = getOrCreateSessionId(req, res);
  const regenerate = req.body?.regenerate === true;
  // For a "build a brand-new set" request, clear ONLY today's cached set so a
  // fresh set is generated below. We deliberately leave the user's in-progress
  // attempt untouched until generation succeeds, so a failed regeneration can
  // never destroy their existing daily attempt.
  if (regenerate) {
    await clearTodayDailySet(userId);
  }
  let questionIds: number[];
  try {
    questionIds = await getOrCreateDailyQuestionIds(userId);
  } catch (err) {
    res.status(502).json({ error: "Could not generate today's quiz. Try again in a moment." });
    return;
  }
  if (questionIds.length === 0) {
    res.status(400).json({ error: "No questions available to build today's quiz." });
    return;
  }

  // Resume the most recent unfinished daily attempt that matches today's set.
  const [recent] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.userId, userId), eq(quizzes.mode, "daily")))
    .orderBy(desc(quizzes.startedAt))
    .limit(1);

  // Regenerate path: generation has now succeeded, so it's safe to discard
  // today's in-progress attempt (if any) and always start a brand-new one.
  // Scoped to the single resumable attempt AND to today (Pacific), so older
  // days' attempts are never touched. quiz_answers cascade-delete with the quiz.
  if (regenerate) {
    if (recent && !recent.finished && dateStrPT(recent.startedAt) === todayStrPT()) {
      await db.delete(quizzes).where(and(eq(quizzes.id, recent.id), eq(quizzes.userId, userId)));
    }
    const [quiz] = await db
      .insert(quizzes)
      .values({ userId, mode: "daily", questionIds })
      .returning();
    res.status(201).json({
      id: quiz.id,
      mode: quiz.mode,
      questions: await buildQuizQuestionView(quiz.questionIds, new Map()),
      currentIndex: 0,
      finished: false,
    });
    return;
  }

  const sameSet =
    recent &&
    !recent.finished &&
    recent.questionIds.length === questionIds.length &&
    recent.questionIds.every((v, i) => v === questionIds[i]);

  if (sameSet) {
    const ans = await db.select().from(quizAnswers).where(eq(quizAnswers.quizId, recent.id));
    const ansMap = new Map(
      ans.map((a) => [a.questionId, { selectedIndex: a.selectedIndex, selectedIndices: a.selectedIndices, correct: a.correct }]),
    );
    res.status(200).json({
      id: recent.id,
      mode: recent.mode,
      questions: await buildQuizQuestionView(recent.questionIds, ansMap, recent.choiceOrders),
      currentIndex: recent.currentIndex,
      finished: recent.finished,
    });
    return;
  }

  const [quiz] = await db
    .insert(quizzes)
    .values({ userId, mode: "daily", questionIds })
    .returning();
  res.status(201).json({
    id: quiz.id,
    mode: quiz.mode,
    questions: await buildQuizQuestionView(quiz.questionIds, new Map()),
    currentIndex: 0,
    finished: false,
  });
});

// Past daily-quiz attempts so the user can revisit an earlier day's set and
// re-read every rationale. One row per finished daily attempt, labelled by the
// Pacific calendar day it was taken. The detailed review reuses GET
// /quizzes/{id} (the existing finished-quiz review screen).
router.get("/quizzes/daily/history", async (req, res): Promise<void> => {
  const userId = getOrCreateSessionId(req, res);
  const limit = Math.min(parseInt((req.query.limit as string) ?? "30", 10) || 30, 100);
  const rows = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.userId, userId), eq(quizzes.mode, "daily"), eq(quizzes.finished, true)))
    .orderBy(desc(quizzes.startedAt))
    .limit(limit);
  const ids = rows.map((r) => r.id);

  // Finished "practice" retakes cloned from any of these daily sets. They share
  // the original daily attempt's id via sourceQuizId, so we can group each
  // retake under the day it re-tested. Listed oldest → newest per source.
  const retakeRows =
    ids.length > 0
      ? await db
          .select()
          .from(quizzes)
          .where(and(eq(quizzes.userId, userId), eq(quizzes.mode, "practice"), eq(quizzes.finished, true), inArray(quizzes.sourceQuizId, ids)))
          .orderBy(quizzes.startedAt)
      : [];

  // One correct-count query covering both the daily attempts and their retakes.
  const allIds = [...ids, ...retakeRows.map((r) => r.id)];
  const correctByQuiz = new Map<number, number>();
  if (allIds.length > 0) {
    const counts = await db
      .select({
        quizId: quizAnswers.quizId,
        correct: sql<number>`sum(case when ${quizAnswers.correct} then 1 else 0 end)`.as("correct"),
      })
      .from(quizAnswers)
      .where(inArray(quizAnswers.quizId, allIds))
      .groupBy(quizAnswers.quizId);
    for (const c of counts) correctByQuiz.set(c.quizId, Number(c.correct) || 0);
  }

  const retakesBySource = new Map<number, typeof retakeRows>();
  for (const rt of retakeRows) {
    const key = rt.sourceQuizId as number;
    const list = retakesBySource.get(key) ?? [];
    list.push(rt);
    retakesBySource.set(key, list);
  }

  res.json(
    rows.map((r) => ({
      id: r.id,
      date: dateStrPT(r.startedAt),
      totalQuestions: r.questionIds.length,
      correctCount: correctByQuiz.get(r.id) ?? 0,
      score: r.score,
      finishedAt: r.finishedAt,
      retakes: (retakesBySource.get(r.id) ?? []).map((rt) => ({
        id: rt.id,
        totalQuestions: rt.questionIds.length,
        correctCount: correctByQuiz.get(rt.id) ?? 0,
        score: rt.score,
        finishedAt: rt.finishedAt,
      })),
    })),
  );
});

// Re-take any past quiz's exact 50-question set (e.g. an earlier daily quiz)
// as a fresh practice run, without regenerating questions. We clone the source
// attempt's questionIds into a brand-new "practice" attempt that scores
// independently and shows up in recent attempts. Mode is "practice" (not
// "daily") so it never gets resumed by the daily endpoint, never appears in the
// daily history list, and doesn't auto-complete the daily plan item.
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

router.post("/quizzes/:id/practice", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { shuffleQuestions = false, shuffleChoices = false } = req.body ?? {};
  const userId = getOrCreateSessionId(req, res);
  const [src] = await db.select().from(quizzes).where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)));
  if (!src) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  if (src.questionIds.length === 0) {
    res.status(400).json({ error: "This quiz has no questions to practice." });
    return;
  }
  // Attribute every retake to the ROOT source attempt so multiple retakes of
  // the same set share one sourceQuizId (even when re-taking a retake).
  const rootSourceId = src.sourceQuizId ?? src.id;

  // Re-take the same questions, optionally in a randomized order so answer
  // positions can't be memorized from the original run.
  const questionIds = shuffleQuestions === true ? shuffled(src.questionIds) : src.questionIds;

  // Optionally randomize each question's choice order. We store a permutation
  // per question (displayedPosition -> originalChoiceIndex). quizAnswers always
  // record ORIGINAL indices, so scoring is unchanged; only the rendered order
  // differs. Single-choice questions (<2 options) are left untouched.
  let choiceOrders: Record<string, number[]> | null = null;
  if (shuffleChoices === true) {
    const qrows = await db
      .select({ id: questions.id, choices: questions.choices })
      .from(questions)
      .where(inArray(questions.id, questionIds));
    const built: Record<string, number[]> = {};
    for (const q of qrows) {
      const n = q.choices.length;
      if (n < 2) continue;
      built[String(q.id)] = shuffled(Array.from({ length: n }, (_, i) => i));
    }
    if (Object.keys(built).length > 0) choiceOrders = built;
  }

  const [quiz] = await db
    .insert(quizzes)
    .values({
      userId,
      mode: "practice",
      notebookId: src.notebookId ?? null,
      topicId: src.topicId ?? null,
      domainId: src.domainId ?? null,
      sourceQuizId: rootSourceId,
      questionIds,
      choiceOrders,
    })
    .returning();
  res.status(201).json({
    id: quiz.id,
    mode: quiz.mode,
    questions: await buildQuizQuestionView(quiz.questionIds, new Map(), quiz.choiceOrders),
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
  const userId = getOrCreateSessionId(req, res);
  const [quiz] = await db.select().from(quizzes).where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)));
  if (!quiz) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const ans = await db.select().from(quizAnswers).where(eq(quizAnswers.quizId, id));
  const ansMap = new Map(ans.map((a) => [a.questionId, { selectedIndex: a.selectedIndex, selectedIndices: a.selectedIndices, correct: a.correct }]));

  // For a retake, surface the original set's date and score so the finished
  // review can show "original X% → retake Y%".
  let source: { id: number; date: string; score: number | null } | null = null;
  if (quiz.sourceQuizId != null) {
    const [src] = await db.select().from(quizzes).where(and(eq(quizzes.id, quiz.sourceQuizId), eq(quizzes.userId, userId)));
    if (src) source = { id: src.id, date: dateStrPT(src.startedAt), score: src.score };
  }

  res.json({
    id: quiz.id,
    mode: quiz.mode,
    questions: await buildQuizQuestionView(quiz.questionIds, ansMap, quiz.choiceOrders),
    currentIndex: quiz.currentIndex,
    finished: quiz.finished,
    score: quiz.score,
    sourceQuizId: quiz.sourceQuizId ?? null,
    source,
  });
});

router.delete("/quizzes/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const userId = getOrCreateSessionId(req, res);
  await db.delete(quizzes).where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)));
  res.sendStatus(204);
});

router.post("/quizzes/:id/answer", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const userId = getOrCreateSessionId(req, res);
  const [ownedQuiz] = await db
    .select({ choiceOrders: quizzes.choiceOrders })
    .from(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)));
  if (!ownedQuiz) {
    res.status(404).json({ error: "Not found" });
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
  // For reshuffled retakes the client picks DISPLAYED positions, but answers and
  // correctness are always tracked against ORIGINAL choice indices. Translate
  // each displayed position back to its original index using the quiz's stored
  // permutation; identity when the quiz isn't reshuffled.
  const rawOrder = ownedQuiz.choiceOrders?.[String(questionId)];
  const order = isValidOrder(rawOrder, q.choices.length) ? rawOrder : null;
  const toOriginal = (d: number) => (order && d >= 0 && d < order.length ? order[d] : d);
  // Map an original index back to its displayed position for the feedback echo.
  const toDisplayed = (o: number) => (order ? order.indexOf(o) : o);

  let correct: boolean;
  let storedIndex: number;
  let storedIndices: number[] | null = null;
  if (q.itemType === "ordering" && Array.isArray(q.correctOrder)) {
    // Drag-and-drop: the client sends `order`, the user's arrangement as ORIGINAL
    // choice indices (ordering items are never choice-shuffled). Store the whole
    // sequence in selectedIndices; full marks require an exact match to the key.
    const submittedOrder = (req.body ?? {}).order;
    if (!isValidOrder(submittedOrder, q.choices.length)) {
      res.status(400).json({ error: "order must be a full arrangement of the choices" });
      return;
    }
    storedIndices = submittedOrder;
    storedIndex = submittedOrder[0] ?? -1;
    correct = arraysEqual(submittedOrder, q.correctOrder);
  } else if (q.multiSelect && Array.isArray(q.correctIndices)) {
    if (!Array.isArray(selectedIndices)) {
      res.status(400).json({ error: "selectedIndices array required for multi-select question" });
      return;
    }
    const cleaned = selectedIndices
      .filter((n: unknown): n is number => typeof n === "number")
      .map(toOriginal);
    storedIndices = cleaned;
    storedIndex = cleaned[0] ?? -1;
    correct = arraysEqualAsSets(cleaned, q.correctIndices);
  } else {
    if (typeof selectedIndex !== "number") {
      res.status(400).json({ error: "selectedIndex required" });
      return;
    }
    storedIndex = toOriginal(selectedIndex);
    correct = storedIndex === q.correctIndex;
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
      .where(and(eq(topicMastery.userId, userId), eq(topicMastery.topicId, q.topicId)));
    if (existing) {
      const attempts = existing.attempts + 1;
      const correctCount = existing.correct + (correct ? 1 : 0);
      await db
        .update(topicMastery)
        .set({ attempts, correct: correctCount, mastery: correctCount / attempts, updatedAt: new Date() })
        .where(and(eq(topicMastery.userId, userId), eq(topicMastery.topicId, q.topicId)));
    } else {
      await db.insert(topicMastery).values({
        userId,
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
      .values({ userId, taskId: q.taskId, attempts: 1, correct: inc, mastery: inc })
      .onConflictDoUpdate({
        target: [taskMastery.userId, taskMastery.taskId],
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
    correctIndex: q.correctIndex != null ? toDisplayed(q.correctIndex) : q.correctIndex,
    correctIndices: q.correctIndices ? q.correctIndices.map(toDisplayed) : undefined,
    multiSelect: q.multiSelect,
    itemType: q.itemType,
    correctOrder: q.itemType === "ordering" ? (q.correctOrder ?? undefined) : undefined,
    rationale: q.rationale,
    sourceUrl: q.sourceUrl,
  });
});

// Auto-check today's quiz plan-items for a finished quiz. We mark the most
// specific key matching this quiz (topicId > domainId > "any") so finishing a
// targeted quiz checks the targeted plan row, not just the generic one. The
// generic "quiz:any" is always marked. markPlanItemComplete is idempotent, so a
// retried finish or a later manual "mark complete" tap won't double-count.
// Extracted from the finish handler so the key derivation can be tested.
export async function linkQuizFinishToPlan(
  sessionId: string,
  date: string,
  quiz: { topicId: number | null; domainId: number | null; mode?: string | null },
): Promise<string[]> {
  const keys: string[] = [];
  if (quiz.topicId) keys.push(`quiz:topic:${quiz.topicId}`);
  if (quiz.domainId) keys.push(`quiz:domain:${quiz.domainId}`);
  if (quiz.mode === "daily") keys.push("quiz:daily");
  keys.push("quiz:any");
  for (const key of keys) {
    await markPlanItemComplete(sessionId, date, key);
  }
  return keys;
}

router.post("/quizzes/:id/finish", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const userId = getOrCreateSessionId(req, res);
  const [owned] = await db
    .select({ id: quizzes.id })
    .from(quizzes)
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)));
  if (!owned) {
    res.status(404).json({ error: "Not found" });
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
    return sum + questionRowCredit(q, a);
  }, 0);
  const score = ans.length === 0 ? 0 : (creditEarned / ans.length) * 100;
  const [updated] = await db
    .update(quizzes)
    .set({ finished: true, score, finishedAt: new Date() })
    .where(and(eq(quizzes.id, id), eq(quizzes.userId, userId)))
    .returning();

  // Auto-mark today's quiz plan-items complete (see linkQuizFinishToPlan).
  if (updated) {
    await linkQuizFinishToPlan(userId, todayStr(), updated);
  }

  res.json({ id, score, total: ans.length, correct: ans.filter((a) => a.correct).length });
});

export default router;
