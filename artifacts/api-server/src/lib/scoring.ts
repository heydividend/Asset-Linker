// Partial-credit scoring for BOC-style questions.
//
// BOC rules we model:
//  - Multi-select items are eligible for partial credit.
//  - An individual item can never score below zero ("no negative point value").
//
// The BOC does not publish its exact partial-credit formula, so we use a
// conservative proportional scheme: an item's credit is the number of correctly
// chosen options minus the number of incorrectly chosen options, divided by the
// number of options that should have been chosen, clamped to [0, 1]. Picking
// wrong options reduces credit; the item can never go below zero. This rewards
// justified selections and discourages indiscriminate guessing.

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

// Credit in [0, 1] for any question. Single-select is all-or-nothing (1 or 0);
// multi-select earns partial credit via multiSelectCredit.
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
