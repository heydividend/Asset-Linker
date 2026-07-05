// Partial-credit scoring for BOC-style questions.
//
// The BOC exam uses five item types (per the official sample exam): single
// multiple-choice, multi-select, drag-and-drop (ordering / matching), and hot
// spot (click a region on an image) — plus focused testlets, which are ordinary
// items that share a scenario and so score per-item like any other.
//
// BOC scoring rules we model:
//  - Multi-response items (multi-select, drag-and-drop, multi hot spot) are
//    eligible for partial credit.
//  - An individual item can never score below zero ("no negative point value").
//
// The BOC does not publish its exact partial-credit formula, so we use a
// conservative proportional scheme consistently across types: credit reflects
// how much of the correct response the candidate produced, with wrong selections
// docking credit, clamped to [0, 1]. This rewards justified responses and
// discourages indiscriminate guessing.

export function multiSelectCredit(selected: number[], correctIndices: number[]): number {
  if (correctIndices.length === 0) return 0;
  const correctSet = new Set(correctIndices);
  let correctPicked = 0;
  let incorrectPicked = 0;
  for (const s of new Set(selected)) {
    if (correctSet.has(s)) correctPicked += 1;
    else incorrectPicked += 1;
  }
  const raw = (correctPicked - incorrectPicked) / correctIndices.length;
  return Math.max(0, Math.min(1, raw));
}

// Drag-and-drop ORDERING (e.g. "sequence these steps of the EAP"): credit is the
// fraction of positions placed correctly. A response shorter/longer than the key
// scores only the positions that line up.
export function orderingCredit(response: number[], correctOrder: number[]): number {
  if (correctOrder.length === 0) return 0;
  let inPlace = 0;
  for (let i = 0; i < correctOrder.length; i += 1) {
    if (response[i] === correctOrder[i]) inPlace += 1;
  }
  return Math.max(0, Math.min(1, inPlace / correctOrder.length));
}

// Drag-and-drop MATCHING (e.g. "drag each special test onto the joint it
// assesses"): correctSlots[i] is the slot the i-th prompt belongs in; response[i]
// is the slot the candidate placed it in (null = left unplaced). Credit is the
// fraction of prompts matched correctly.
export function matchingCredit(response: Array<number | null>, correctSlots: number[]): number {
  if (correctSlots.length === 0) return 0;
  let matched = 0;
  for (let i = 0; i < correctSlots.length; i += 1) {
    if (response[i] != null && response[i] === correctSlots[i]) matched += 1;
  }
  return Math.max(0, Math.min(1, matched / correctSlots.length));
}

// HOT SPOT: the candidate clicks one or more regions on an image; correctRegions
// is the set of acceptable region ids. Scores like a multi-select over regions
// (single-region hot spots are the one-correct case).
export function hotspotCredit(selectedRegions: number[], correctRegions: number[]): number {
  return multiSelectCredit(selectedRegions, correctRegions);
}

// Discriminated answer key for any item type. `mc`/`multi` keep the existing
// shape so current questions and callers are unaffected.
export type ItemKey =
  | { kind: "mc"; correctIndex: number }
  | { kind: "multi"; correctIndices: number[] }
  | { kind: "ordering"; correctOrder: number[] }
  | { kind: "matching"; correctSlots: number[] }
  | { kind: "hotspot"; correctRegions: number[] };

// Credit in [0, 1] for any item type, given the candidate's response. Single
// multiple-choice is all-or-nothing; every multi-response type earns proportional
// partial credit via the helpers above. An unanswered item scores 0.
export function scoreItem(key: ItemKey, response: unknown): number {
  switch (key.kind) {
    case "mc":
      return response === key.correctIndex ? 1 : 0;
    case "multi":
      return Array.isArray(response) ? multiSelectCredit(response as number[], key.correctIndices) : 0;
    case "ordering":
      return Array.isArray(response) ? orderingCredit(response as number[], key.correctOrder) : 0;
    case "matching":
      return Array.isArray(response) ? matchingCredit(response as Array<number | null>, key.correctSlots) : 0;
    case "hotspot":
      return Array.isArray(response) ? hotspotCredit(response as number[], key.correctRegions) : 0;
    default:
      return 0;
  }
}

// Credit in [0, 1] for a stored question. Single-select is all-or-nothing (1 or
// 0); multi-select earns partial credit via multiSelectCredit. Retained for the
// existing mock-exam / quiz callers; new item types should use questionRowCredit.
export function questionCredit(
  q: { multiSelect: boolean; correctIndex: number; correctIndices: number[] | null },
  selected: number | number[] | null | undefined,
): number {
  if (q.multiSelect && Array.isArray(q.correctIndices)) {
    if (!Array.isArray(selected)) return 0;
    return multiSelectCredit(selected, q.correctIndices);
  }
  return selected === q.correctIndex ? 1 : 0;
}

// Exact element-wise equality of two index arrays (order matters). Used to flag
// a fully-correct ordering response.
export function arraysEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

// Credit in [0, 1] for any stored question row given the candidate's stored
// answer. Dispatches on itemType: "ordering" grades the arranged sequence with
// proportional partial credit; everything else falls back to questionCredit
// (single-select all-or-nothing, multi-select partial). This is the single entry
// point quiz/mock scoring should use so new item types score correctly.
export function questionRowCredit(
  q: {
    itemType?: string | null;
    multiSelect: boolean;
    correctIndex: number;
    correctIndices: number[] | null;
    correctOrder?: number[] | null;
  },
  answer: { selectedIndex: number | null; selectedIndices: number[] | null },
): number {
  if (q.itemType === "ordering" && Array.isArray(q.correctOrder)) {
    return orderingCredit(answer.selectedIndices ?? [], q.correctOrder);
  }
  return questionCredit(q, q.multiSelect ? (answer.selectedIndices ?? []) : answer.selectedIndex);
}
