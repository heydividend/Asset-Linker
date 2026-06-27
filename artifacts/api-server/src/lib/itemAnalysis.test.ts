import { test } from "node:test";
import assert from "node:assert/strict";
import { itemAnalysis, rankProblematic, type ItemResponse } from "./itemAnalysis";

// Build responses across N attempts where each attempt has a known overall
// performance, so discrimination is predictable.
function mkResponses(): ItemResponse[] {
  const out: ItemResponse[] = [];
  // 10 attempts: attempts 0–4 are "strong" (get the good item right), 5–9 "weak".
  for (let a = 0; a < 10; a += 1) {
    const strong = a < 5;
    // Q1: good item — strong get it right, weak get it wrong (positive discrimination).
    out.push({ questionId: 1, attemptId: a, correct: strong, selected: [strong ? 0 : 1] });
    // Q2: reversed/miskeyed — weak get it right, strong wrong (negative discrimination).
    out.push({ questionId: 2, attemptId: a, correct: !strong, selected: [strong ? 2 : 0] });
    // Q3: everyone right (too easy, zero discrimination).
    out.push({ questionId: 3, attemptId: a, correct: true, selected: [0] });
    // Filler items to separate strong/weak overall performance.
    for (let f = 0; f < 3; f += 1) {
      out.push({ questionId: 100 + f, attemptId: a, correct: strong, selected: [strong ? 0 : 1] });
    }
  }
  return out;
}

test("itemAnalysis: p-value (difficulty)", () => {
  const stats = itemAnalysis(mkResponses());
  const q1 = stats.find((s) => s.questionId === 1)!;
  const q3 = stats.find((s) => s.questionId === 3)!;
  assert.equal(q1.pValue, 0.5);
  assert.equal(q3.pValue, 1); // everyone correct
});

test("itemAnalysis: discrimination sign", () => {
  const stats = itemAnalysis(mkResponses());
  const q1 = stats.find((s) => s.questionId === 1)!; // good item
  const q2 = stats.find((s) => s.questionId === 2)!; // miskeyed
  assert.ok(q1.discrimination > 0.2, `q1 disc ${q1.discrimination}`);
  assert.ok(q2.discrimination < 0, `q2 disc ${q2.discrimination}`);
  assert.ok(q2.flags.includes("negative-discrimination"));
});

test("itemAnalysis: too-easy flag and zero discrimination", () => {
  const q3 = itemAnalysis(mkResponses()).find((s) => s.questionId === 3)!;
  assert.ok(q3.flags.includes("too-easy"));
  assert.equal(q3.discrimination, 0); // no variance among correctness
});

test("itemAnalysis: insufficient-data below minN", () => {
  const resp: ItemResponse[] = [
    { questionId: 9, attemptId: 0, correct: true, selected: [0] },
    { questionId: 9, attemptId: 1, correct: false, selected: [1] },
  ];
  const s = itemAnalysis(resp).find((x) => x.questionId === 9)!;
  assert.ok(s.flags.includes("insufficient-data"));
});

test("itemAnalysis: non-functional distractor detection", () => {
  // 10 responses, choices 0..3, correct=0. Choice 3 never chosen → dead distractor.
  const resp: ItemResponse[] = Array.from({ length: 10 }, (_, i) => ({
    questionId: 7,
    attemptId: i,
    correct: i % 2 === 0,
    selected: [i % 2 === 0 ? 0 : i % 3 === 0 ? 1 : 2], // never 3
  }));
  const meta = new Map([[7, { numChoices: 4, correctIndices: [0] }]]);
  const s = itemAnalysis(resp, { meta }).find((x) => x.questionId === 7)!;
  assert.ok(s.nonFunctionalDistractors.includes(3));
  assert.ok(s.flags.includes("non-functional-distractor"));
});

test("rankProblematic: miskeyed item ranks first, drops clean items", () => {
  const ranked = rankProblematic(itemAnalysis(mkResponses()));
  assert.equal(ranked[0].questionId, 2); // negative discrimination = worst
  assert.ok(!ranked.some((s) => s.questionId === 1)); // good item not flagged
});
