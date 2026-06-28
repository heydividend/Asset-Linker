---
name: Admin activity feed attribution & limits
description: How the admin "all users' activity" feed is built — which tables are attributable and the per-type-limit invariant.
---

# Admin activity feed

The admin global/per-user activity feed merges events from the user-scoped
tables: quizzes (finished), mockExams (submitted), dailyQuizSets, conversations
(AI tutor), and gameSessions. gameSessions uses `sessionId`, which equals the
Clerk user id (see getOrCreateSessionId), so games ARE attributable.

**Excluded:** notes / studyGuides / notebooks / flashcards have NO userId column
(shared globally), so they cannot be attributed to a user — do not add them to
the feed without first adding ownership columns.

**Per-type limit invariant:** the global feed fetches each event type ordered by
time desc with a per-type limit, then merges/sorts and slices to a global limit.
The per-type fetch limit MUST equal the global return limit. **Why:** the global
top-N can contain at most N events of any single type, so fetching the N most
recent of each type guarantees the merged top-N is the true global top-N. If the
per-type limit is smaller than the return limit, a high-volume type can hide
newer events of other types (lossy clipping).
