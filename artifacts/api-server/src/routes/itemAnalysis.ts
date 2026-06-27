import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, quizAnswers, questions, domains } from "@workspace/db";
import { itemAnalysis, rankProblematic, type ItemResponse, type ItemMeta } from "../lib/itemAnalysis";

const router: IRouter = Router();

// GET /api/item-analysis — classical item statistics over the answer history, so
// flawed practice items (miskeyed, non-discriminating, dead distractors) can be
// found and fixed. Query params: ?minN= (min responses, default 5), ?limit=.
router.get("/item-analysis", async (req, res): Promise<void> => {
  const minN = Math.max(1, Number(req.query.minN) || 5);
  const limit = Math.max(1, Math.min(500, Number(req.query.limit) || 100));

  const rows = await db
    .select({
      questionId: quizAnswers.questionId,
      quizId: quizAnswers.quizId,
      correct: quizAnswers.correct,
      selectedIndex: quizAnswers.selectedIndex,
      selectedIndices: quizAnswers.selectedIndices,
      correctIndex: questions.correctIndex,
      correctIndices: questions.correctIndices,
      choices: questions.choices,
      stem: questions.stem,
      domainId: questions.domainId,
    })
    .from(quizAnswers)
    .innerJoin(questions, eq(questions.id, quizAnswers.questionId));

  if (rows.length === 0) {
    res.json({ totalAnswers: 0, analyzed: 0, flagCounts: {}, items: [], note: "No answers recorded yet — take some quizzes first." });
    return;
  }

  const responses: ItemResponse[] = rows.map((r) => ({
    questionId: r.questionId,
    attemptId: r.quizId,
    correct: r.correct,
    selected: Array.isArray(r.selectedIndices) && r.selectedIndices.length ? r.selectedIndices : [r.selectedIndex],
  }));

  const meta = new Map<number, ItemMeta>();
  const stemById = new Map<number, string>();
  const domainById = new Map<number, number | null>();
  for (const r of rows) {
    if (!meta.has(r.questionId)) {
      const correctIndices = Array.isArray(r.correctIndices) && r.correctIndices.length ? r.correctIndices : [r.correctIndex];
      meta.set(r.questionId, { numChoices: Array.isArray(r.choices) ? r.choices.length : undefined, correctIndices });
      stemById.set(r.questionId, r.stem);
      domainById.set(r.questionId, r.domainId);
    }
  }

  const stats = itemAnalysis(responses, { meta, minN });
  const problematic = rankProblematic(stats);

  // Flag tally across all analyzed items.
  const flagCounts: Record<string, number> = {};
  for (const s of stats) for (const f of s.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;

  const dRows = await db.select().from(domains);
  const domainCode = (id: number | null) => (id == null ? null : dRows.find((d) => d.id === id)?.code ?? null);

  res.json({
    totalAnswers: rows.length,
    analyzed: stats.length,
    flagCounts,
    items: problematic.slice(0, limit).map((s) => ({
      questionId: s.questionId,
      stem: stemById.get(s.questionId)?.slice(0, 160) ?? "",
      domain: domainCode(domainById.get(s.questionId) ?? null),
      n: s.n,
      pValue: s.pValue,
      discrimination: s.discrimination,
      nonFunctionalDistractors: s.nonFunctionalDistractors,
      flags: s.flags,
    })),
  });
});

export default router;
