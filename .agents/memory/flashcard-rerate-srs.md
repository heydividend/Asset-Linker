---
name: Flashcard re-rate SRS compounding
description: Why "change my rating" on a flashcard re-applies SM-2 instead of overwriting, and the accepted tradeoff
---

# Flashcard re-rate uses the same review endpoint (intentional)

In FlashcardsReview Review mode, the user can step back to a card they rated
this session (client-side `history` array, since the server drops reviewed
cards from the due list) and pick a different rating. Re-rating calls the SAME
`POST /flashcards/:id/review` — it does NOT overwrite the original review event.

**Why:** True idempotent correction would need a server snapshot of the
pre-review card state (ease/interval/reps) or an event log to recompute from.
That's backend complexity outside the "production wrap-up / minimal scope" of
this project. The review endpoint recomputes SM-2 from the card's *current*
state each call.

**Consequence:** Re-rating compounds slightly — e.g. Easy then Again resets
reps=0/interval=1 (correct), but ease_factor keeps the prior uplift because the
endpoint never lowers EF for quality<3. Mild schedule drift, self-correcting,
acceptable for single-user misclick correction. UI copy frames it as "Pick a
different rating if you misjudged it" to set that expectation.

**How to apply:** If strict change-rating semantics are ever required, add
server support to recompute from a pre-review snapshot (or store the last
review delta and reverse it) rather than calling review again.
