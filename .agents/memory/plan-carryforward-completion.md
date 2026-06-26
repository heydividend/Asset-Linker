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
