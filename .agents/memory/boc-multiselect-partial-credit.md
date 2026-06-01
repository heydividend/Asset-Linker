---
name: BOC multi-select partial credit
description: How/why multi-select questions are scored with partial credit in mock exams and quizzes, and the deliberate scope boundary around mastery.
---

# Multi-select partial-credit scoring

Multi-select questions earn **partial credit**, not all-or-nothing. The formula
(in `artifacts/api-server/src/lib/scoring.ts`, mirrored client-side in
`QuizRunner.tsx`) is:

`credit = clamp((correctPicked - incorrectPicked) / totalCorrect, 0, 1)`

Single-select stays all-or-nothing (1 or 0).

**Why:** The BOC publicly states multi-select/drag-and-drop items are eligible
for partial credit and that an individual item can never score below zero, but it
does NOT publish the exact formula. The user prep'ing for the June 2026 exam asked
for a *conservative* model where picking wrong options reduces credit (discourages
indiscriminate guessing) while never going negative. This formula satisfies both
published rules. There is no drag-and-drop in this app — only `multiSelect`.

**How to apply:** If you change the formula, change it in BOTH the server helper
and the `questionCredit` copy in `QuizRunner.tsx` (they must stay in parity).
Mock exam scoring accumulates fractional credit; quiz `finish` recomputes score
from stored `selectedIndices` + `correctIndices`.

**Deliberate scope boundary:** `quizAnswers.correct` (boolean) and `topicMastery`
were intentionally LEFT on full-correct semantics to avoid a schema migration
(`topicMastery.correct` is an integer column). So a partially-correct multi-select
counts toward `score` but NOT toward mastery/weakness trends. This is an accepted
analytics inconsistency, not a bug — revisit only if the user wants fractional
mastery (would need a column type change + migration via `drizzle-kit push`).
