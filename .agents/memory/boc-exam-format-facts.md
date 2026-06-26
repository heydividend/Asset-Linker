---
name: BOC exam format facts
description: Real-exam structure facts that drive pacing/quiz-mode design decisions in the notebook
---

# BOC exam format facts (drive feature design)

These are domain facts about the real BOC exam, used to size practice features.
They are NOT derivable from the question bank.

- **Pace ≈ 82 sec/question.** The real exam is ~175 questions in 4 hours
  (240 min) → ~82s each. Encoded as `PER_Q_SEC = 82` in QuizRunner timed mode;
  the mock exam derives its own per-question budget from `timeLimitSec / total`.
- **Item types that throw students:** scenario / multi-select ("select all that
  apply") items, and a small number (~5, ~3%) of matching items.
- **Multi-select coverage:** the bank has ~214 multi-select questions. Quiz mode
  `multi_select` drills only those, pulled cross-domain (skips the single-topic
  resolution that adaptive/weakness modes use).
- **Matching is low-ROI to expand** (~3% of exam) and already has a practice
  game (MatchingGame + games.json). Don't over-invest there.

**Why:** the student (Jacob) failed his first attempt and named test pacing +
multi-select/scenario items + unfamiliar matching as what threw him off. Features
are sized to that, not spread evenly.

**How to apply:** when adding timing/pacing features keep ~82s/q as the BOC
reference; when adding format-drill features prioritize multi-select over
matching. Timed quiz mode is frontend-only (no schema): `?timed=1` starts it and
the start timestamp persists in `localStorage` key `boc:timed-start:<quizId>` so
it survives exit/resume (the Resume link does not carry query params).
