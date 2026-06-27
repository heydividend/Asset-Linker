---
name: Quiz choice reshuffle invariant
description: How reshuffled practice retakes keep scoring correct despite randomized choice order
---
Reshuffled practice retakes store a per-quiz `choiceOrders` permutation on the
`quizzes` row: `{ [questionId]: number[] }` where `displayedPosition -> originalChoiceIndex`.

**Rule:** `quizAnswers` ALWAYS record ORIGINAL choice indices, never displayed positions.
The permutation is applied only at the API boundary:
- read/display (buildQuizQuestionView): reorder `choices`, and map original `correctIndex`/`correctIndices`/stored answer indices → displayed positions.
- write (answer endpoint): translate the client's DISPLAYED pick back to the original index before comparing/storing.

**Why:** `choices`/`correctIndex` live on the shared `questions` table (one row, many quizzes), so choice order can't be persisted per-question. Keeping answers in original-index space means scoring (`finish`, mastery rollups) is identical whether or not the retake was reshuffled — no scoring code had to change.

**How to apply:** Any new surface that reads or writes quiz answers must go through the same translate-at-the-boundary helpers, or it will mis-score reshuffled attempts. Daily/adaptive quizzes leave `choiceOrders` null (identity). Validate a permutation (full 0..n-1, no dupes) before applying so a stale/malformed order degrades to identity instead of dropping choices.
