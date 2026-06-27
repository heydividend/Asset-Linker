import { test } from "node:test";
import assert from "node:assert/strict";
import {
  multiSelectCredit,
  orderingCredit,
  matchingCredit,
  hotspotCredit,
  scoreItem,
  questionCredit,
} from "./scoring";

const approx = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

// ── Multi-select (existing behavior) ────────────────────────────────────────
test("multiSelect: all correct = full credit", () => {
  approx(multiSelectCredit([0, 2, 3], [0, 2, 3]), 1);
});
test("multiSelect: partial correct = proportional", () => {
  approx(multiSelectCredit([0, 2], [0, 2, 3]), 2 / 3);
});
test("multiSelect: wrong picks dock credit, never below zero", () => {
  approx(multiSelectCredit([0, 1], [0, 2, 3]), 0); // 1 right - 1 wrong = 0/3
  approx(multiSelectCredit([1, 4, 5], [0, 2, 3]), 0); // -3/3 clamped to 0
});
test("multiSelect: duplicate selections don't inflate", () => {
  approx(multiSelectCredit([0, 0, 0], [0, 2, 3]), 1 / 3);
});
test("multiSelect: empty key scores zero", () => {
  approx(multiSelectCredit([0], []), 0);
});

// ── Drag-and-drop ordering ──────────────────────────────────────────────────
test("ordering: perfect sequence = full credit", () => {
  approx(orderingCredit([2, 0, 1, 3], [2, 0, 1, 3]), 1);
});
test("ordering: partial positions correct", () => {
  approx(orderingCredit([2, 1, 0, 3], [2, 0, 1, 3]), 2 / 4); // pos 0 and 3 right
});
test("ordering: fully reversed scores low but never negative", () => {
  const c = orderingCredit([3, 1, 0, 2], [2, 0, 1, 3]);
  assert.ok(c >= 0 && c <= 1);
});
test("ordering: short/long responses score only aligned positions", () => {
  approx(orderingCredit([2, 0], [2, 0, 1, 3]), 2 / 4);
});

// ── Drag-and-drop matching ──────────────────────────────────────────────────
test("matching: all pairs correct = full credit", () => {
  approx(matchingCredit([1, 0, 2], [1, 0, 2]), 1);
});
test("matching: partial pairs", () => {
  approx(matchingCredit([1, 2, 2], [1, 0, 2]), 2 / 3);
});
test("matching: unplaced prompts (null) earn nothing for that prompt", () => {
  approx(matchingCredit([1, null, 2], [1, 0, 2]), 2 / 3);
});

// ── Hot spot ────────────────────────────────────────────────────────────────
test("hotspot: single correct region", () => {
  approx(hotspotCredit([4], [4]), 1);
  approx(hotspotCredit([2], [4]), 0);
});
test("hotspot: multi-region behaves like multi-select", () => {
  approx(hotspotCredit([1, 3], [1, 3, 5]), 2 / 3);
  approx(hotspotCredit([1, 2], [1, 3, 5]), 0); // 1 right - 1 wrong
});

// ── Unified scoreItem dispatch ──────────────────────────────────────────────
test("scoreItem: mc all-or-nothing", () => {
  approx(scoreItem({ kind: "mc", correctIndex: 2 }, 2), 1);
  approx(scoreItem({ kind: "mc", correctIndex: 2 }, 1), 0);
});
test("scoreItem: routes each type", () => {
  approx(scoreItem({ kind: "multi", correctIndices: [0, 1] }, [0, 1]), 1);
  approx(scoreItem({ kind: "ordering", correctOrder: [0, 1, 2] }, [0, 1, 2]), 1);
  approx(scoreItem({ kind: "matching", correctSlots: [2, 0, 1] }, [2, 0, 1]), 1);
  approx(scoreItem({ kind: "hotspot", correctRegions: [3] }, [3]), 1);
});
test("scoreItem: unanswered / wrong-typed response scores zero", () => {
  approx(scoreItem({ kind: "multi", correctIndices: [0, 1] }, null), 0);
  approx(scoreItem({ kind: "ordering", correctOrder: [0, 1] }, undefined), 0);
  approx(scoreItem({ kind: "mc", correctIndex: 0 }, null), 0);
});

// ── Backward-compat questionCredit ──────────────────────────────────────────
test("questionCredit: single-select unchanged", () => {
  approx(questionCredit({ multiSelect: false, correctIndex: 1, correctIndices: null }, 1), 1);
  approx(questionCredit({ multiSelect: false, correctIndex: 1, correctIndices: null }, 0), 0);
});
test("questionCredit: multi-select partial unchanged", () => {
  approx(questionCredit({ multiSelect: true, correctIndex: 0, correctIndices: [0, 2] }, [0]), 1 / 2);
  approx(questionCredit({ multiSelect: true, correctIndex: 0, correctIndices: [0, 2] }, null), 0);
});
