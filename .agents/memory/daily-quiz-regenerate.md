---
name: Daily quiz regenerate ordering
description: Why "Regenerate today's set" must generate before deleting the in-progress attempt, and scope deletion to today.
---

# Daily quiz "Regenerate today's set" ordering

POST /api/quizzes/daily accepts `{ regenerate: true }`. The order of operations matters:

1. Clear ONLY today's `dailyQuizSets` cache row (`clearTodayDailySet`) — safe, no user progress lost.
2. Generate the new set (`getOrCreateDailyQuestionIds`) — may fail / throw (AI dependency).
3. ONLY after generation succeeds, delete today's in-progress daily attempt and create a fresh one.

**Why:** Generation is AI-backed and can fail (502). If you delete the user's
unfinished attempt BEFORE generating and generation then fails, their in-progress
quiz is gone with no replacement — real data loss. Deleting only after success
preserves the old attempt on failure.

**Why scope deletion narrowly:** Delete only the single most-recent resumable
attempt, gated on `dateStrPT(startedAt) === todayStrPT()`. A broad
`mode='daily' AND finished=false` delete also wipes prior days' unfinished
attempts. quiz_answers cascade-delete with their quiz (FK onDelete cascade).

**How to apply:** Any "rebuild today's set" style action that destroys existing
attempts must generate-then-replace, never delete-then-generate.

**Test note:** The daily route tests avoid AI by pre-seeding the `dailyQuizSets`
cache. A regenerate test clears that cache, so it would trigger real AI / the
random-pool fallback — not deterministic without mocking the AI layer. That's why
regenerate has no dedicated route test.
