// Classical item analysis — the same lens the BOC's psychometricians (per the
// Castle "Item Analysis Explanation") use to vet exam items, applied here to the
// app's own answer history so weak or broken practice items can be found and
// fixed.
//
// For each question it computes:
//  - difficulty (p-value): fraction of responses that were correct. Very high
//    (≈1) means too easy; very low with poor discrimination often means flawed
//    or miskeyed.
//  - discrimination (point-biserial): how well getting the item right tracks
//    overall performance. High positive = good; near-zero = uninformative;
//    NEGATIVE = strong performers miss it more than weak ones (usually a miskey
//    or ambiguous item).
//  - option selection counts: how often each choice was chosen, to surface
//    non-functional distractors (chosen by almost no one).

export type ItemResponse = {
  questionId: number;
  attemptId: number; // groups responses from the same quiz/mock attempt
  correct: boolean;
  selected: number[]; // chosen choice indices (single- or multi-select)
};

export type ItemMeta = { numChoices?: number; correctIndices?: number[] };

export type ItemStat = {
  questionId: number;
  n: number;
  pValue: number; // difficulty (fraction correct)
  discrimination: number; // point-biserial vs. attempt performance
  optionCounts: Record<number, number>; // choice index -> times selected
  nonFunctionalDistractors: number[]; // distractor indices chosen by < threshold of respondents
  flags: string[];
};

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

export type ItemAnalysisOptions = {
  meta?: Map<number, ItemMeta>;
  minN?: number; // below this many responses, flag "insufficient-data" and skip stat-based flags
  easyP?: number; // p-value at/above which an item is "too easy" (default 0.95)
  hardP?: number; // p-value at/below which an item is "too hard" (default 0.30)
  lowDisc?: number; // discrimination below which an item is "low-discrimination" (default 0.15)
  deadDistractorPct?: number; // selection share below which a distractor is non-functional (default 0.05)
};

/**
 * Compute classical item statistics over a flat list of responses. Attempt
 * "performance" for the point-biserial is each attempt's proportion correct,
 * which normalizes across attempts of different lengths (daily quiz vs. full
 * mock). Pure and deterministic — no DB or time dependency.
 */
export function itemAnalysis(responses: ItemResponse[], opts: ItemAnalysisOptions = {}): ItemStat[] {
  const minN = opts.minN ?? 5;
  const easyP = opts.easyP ?? 0.95;
  const hardP = opts.hardP ?? 0.3;
  const lowDisc = opts.lowDisc ?? 0.15;
  const deadPct = opts.deadDistractorPct ?? 0.05;

  // Attempt performance = proportion correct within each attempt.
  const perAttempt = new Map<number, { c: number; n: number }>();
  for (const r of responses) {
    const a = perAttempt.get(r.attemptId) ?? { c: 0, n: 0 };
    a.c += r.correct ? 1 : 0;
    a.n += 1;
    perAttempt.set(r.attemptId, a);
  }
  const attemptPerf = new Map<number, number>();
  for (const [id, a] of perAttempt) attemptPerf.set(id, a.n > 0 ? a.c / a.n : 0);

  // Group responses by question.
  const byQuestion = new Map<number, ItemResponse[]>();
  for (const r of responses) (byQuestion.get(r.questionId) ?? byQuestion.set(r.questionId, []).get(r.questionId)!).push(r);

  const allPerf = [...attemptPerf.values()];
  const sdAll = stddev(allPerf);

  const stats: ItemStat[] = [];
  for (const [questionId, rs] of byQuestion) {
    const n = rs.length;
    const correctCount = rs.filter((r) => r.correct).length;
    const pValue = n > 0 ? correctCount / n : 0;

    const perfCorrect = rs.filter((r) => r.correct).map((r) => attemptPerf.get(r.attemptId) ?? 0);
    const perfWrong = rs.filter((r) => !r.correct).map((r) => attemptPerf.get(r.attemptId) ?? 0);
    // Point-biserial: ((M1 - M0) / SD_total) * sqrt(p(1-p)).
    let discrimination = 0;
    if (sdAll > 0 && perfCorrect.length && perfWrong.length) {
      discrimination = ((mean(perfCorrect) - mean(perfWrong)) / sdAll) * Math.sqrt(pValue * (1 - pValue));
    }
    discrimination = Math.round(discrimination * 1000) / 1000;

    const optionCounts: Record<number, number> = {};
    for (const r of rs) for (const s of r.selected) optionCounts[s] = (optionCounts[s] ?? 0) + 1;

    const meta = opts.meta?.get(questionId);
    const correctSet = new Set(meta?.correctIndices ?? []);
    const nonFunctionalDistractors: number[] = [];
    if (meta?.numChoices) {
      for (let i = 0; i < meta.numChoices; i += 1) {
        if (correctSet.has(i)) continue;
        if ((optionCounts[i] ?? 0) / n < deadPct) nonFunctionalDistractors.push(i);
      }
    }

    const flags: string[] = [];
    if (n < minN) flags.push("insufficient-data");
    else {
      if (discrimination < 0) flags.push("negative-discrimination");
      else if (discrimination < lowDisc) flags.push("low-discrimination");
      if (pValue >= easyP) flags.push("too-easy");
      if (pValue <= hardP) flags.push("too-hard");
      if (nonFunctionalDistractors.length) flags.push("non-functional-distractor");
    }

    stats.push({ questionId, n, pValue: Math.round(pValue * 1000) / 1000, discrimination, optionCounts, nonFunctionalDistractors, flags });
  }
  return stats;
}

// Rank most-problematic-first for a review queue: negative discrimination is the
// worst signal, then low discrimination, then hard+undiscriminating items.
export function rankProblematic(stats: ItemStat[]): ItemStat[] {
  const severity = (s: ItemStat) =>
    (s.flags.includes("negative-discrimination") ? 1000 : 0) +
    (s.flags.includes("low-discrimination") ? 100 : 0) +
    (s.flags.includes("too-hard") ? 50 : 0) +
    (s.flags.includes("non-functional-distractor") ? 10 : 0) +
    (s.flags.includes("too-easy") ? 5 : 0);
  return [...stats].filter((s) => s.flags.some((f) => f !== "insufficient-data")).sort((a, b) => severity(b) - severity(a) || a.discrimination - b.discrimination);
}
