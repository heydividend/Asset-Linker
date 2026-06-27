---
name: prod data rescue bootstrap
description: How the BOC-notebook production single-user data + account restore works and its republish gotcha
---

# Production data/account rescue bootstrap

`api-server/src/lib/prodBootstrap.ts` runs on every server boot (fire-and-forget
after `app.listen`, non-fatal). It rescues the original single-user study data in
PRODUCTION after the multi-user (Clerk) build went live.

## Why it exists
Prod DB held real study history keyed with EMPTY user_id (NULL/`''`) — quizzes,
topic_mastery (organic values), exam_schedule, mock_exams, conversations, etc.
The multi-user build filters everything by the signed-in Clerk user id, so that
owner-less data became invisible. Bootstrap (1) creates the admin + student Clerk
accounts and (2) re-keys all owner-less rows to the student's prod Clerk id.

## Environment gating
Gated on `CLERK_SECRET_KEY` starting with `sk_live`. Replit-managed Clerk uses
`sk_test` in development and **auto-swaps to `sk_live` on publish** (separate dev
vs prod Clerk instances + separate DBs). So the bootstrap NEVER runs/touches dev.

## The republish gotcha (this caused a "still no users" failure)
- Account creation requires `SEED_ADMIN_PW` + `SEED_STUDENT_PW` secrets. If either
  is missing, `ensureUser` skips creation, `studentId` stays null, and data
  adoption is skipped too — i.e. publishing with empty passwords does NOTHING.
- **Why:** secrets must be SET BEFORE republishing. A running deployment's env is
  fixed at publish time; adding a secret afterward requires a fresh republish for
  the production runtime to see it.
- **How to apply:** confirm `viewEnvVars` shows both SEED_*_PW present, THEN tell
  the user to republish. Setting them after a deploy and not republishing = no-op.

## Conflict safety
topic_mastery, task_mastery, daily_quiz_sets, readiness_snapshots have
`unique(user_id, <col>)`. Adoption first DELETEs owner-less rows that collide with
a row the student already owns (student's newer row wins), then re-keys the rest —
so partial retries can't abort on a unique violation. Other tables are plain
re-keys. Idempotent: once a row has a real user_id it's never matched again.
