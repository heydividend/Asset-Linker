---
name: Plan carry-forward completion contract
description: How an overdue/carried-forward plan item is cleared, and how recurring mock_exam completion keys work in boc-notebook.
---

# Clearing a carried-forward plan item

A past plan item surfaces ("carries forward") in `/plan/today` whenever its
`planItemKey` is NOT in the through-today completion set
(`listCompletedKeysThrough(sessionId, today)` in `planCompletions.ts`).

**To stop an item carrying forward, record its key in `planCompletions` on any
date ≤ today.** Only the `itemKey` matters for carry-forward — the `date` column
of the completion row is irrelevant to whether it surfaces (the rollover query
matches by key across all dates ≤ today). So a make-up activity can clear an
overdue item by writing the overdue item's key dated *today*.

**Why:** rollover dedupes by key and "earliest occurrence wins"; completion is
keyed, not dated, so a later make-up legitimately satisfies an earlier day.

# Recurring mock_exam keys

`mock_exam` items use a per-scheduled-day key (`mock_exam:<scheduledDate>`), set
via the item's `scheduledDate`. There is one mock per scheduled day (weekly
Saturdays + two extra final-week sims). Auto-completion on a scheduled mock day
clears *that* day's key; a make-up mock submitted on a non-scheduled day clears
the *earliest still-uncompleted* past mock's key. `markPlanItemComplete` is
idempotent on (sessionId, date, itemKey), so manual "mark complete" + auto +
make-up never double-count.

**How to apply:** when adding logic that satisfies overdue items, compute the
*overdue item's* key and call `markPlanItemComplete`; don't invent a new key.

# Reconstructing per-day history for recurring keys

Recurring keys (`quiz:daily`, `flashcards:due`) appear on MANY schedule days,
so "key ever completed ≤ today" must never be used to decide whether a
*specific past day* was done — one completion would mark every day complete.

**Rule:** attribute each completion row to exactly one scheduled occurrence:
exact-date match wins first; otherwise it clears the earliest still-unmatched
occurrence ≤ the completion date (late carry-forward). Occurrence lists must
span the FULL schedule (incl. today/future) so today's recurring completion
isn't misread as a late catch-up of an old miss. Pure matcher + tests live in
the api-server plan-history lib.

**Why:** first history implementation used ever-completed and failed review —
recurring items inflated dayComplete for all past days.
