---
name: Flashcard re-rate SRS compounding
description: Why "change my rating" on a flashcard re-applies SM-2 instead of overwriting, and the accepted tradeoff
---

# Flashcard re-rate re-applies SM-2 (intentional, not an overwrite)

When the user steps back to change a flashcard's confidence rating, it goes
through the normal review path again rather than overwriting the original
review event.

**Why:** A true correction would need a pre-review snapshot of the card's
scheduling state (or an event log) to recompute from. That backend work is out
of scope for this minimal production wrap-up; scheduling stays server-owned and
recomputes from the card's current state on each review.

**Consequence / tradeoff:** Re-rating compounds slightly (notably ease factor
isn't lowered on a low rating), so the schedule can drift a little. Acceptable
and self-correcting for single-user misclick correction; UI copy sets the
"fix a misjudged rating" expectation.

**How to apply:** If strict change-rating semantics are ever needed, add a
server-side recompute-from-snapshot (or reverse-the-last-delta) path instead of
re-running the normal review.
