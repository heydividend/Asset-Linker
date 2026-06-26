---
name: api-server HTTP-level route tests
description: How to write route tests that exercise the real Express app, and the shared-DB gotcha behind "relation does not exist"
---

# api-server route tests at the HTTP level

`artifacts/api-server/src/app.ts` (default export `app`) has NO startup side
effects — the reminder scheduler and study-group sweeper only start in
`index.ts`. So a test can `import app from "../app"`, `app.listen(0)`, and hit
it with `fetch` to exercise route handlers (session cookie, plan-completion
writes, etc.) end to end. Pass a fixed `boc_sid` cookie matching
`^[A-Za-z0-9_-]{16,}$` to get a deterministic session id for asserting
`plan_completions` rows.

**Why:** logic like quiz-finish → `quiz:daily` completion and review-sheet →
`review_sheet:*` completion lives inline in route handlers, not in extractable
libs, so HTTP is the faithful way to cover it.

**How to apply:** seed your own domain/topics/questions and (for the daily
quiz) a deterministic `daily_quiz_sets` row for today so no AI generation runs;
save and restore any pre-existing row so real data is never clobbered; clean up
fixtures in `after`.

## Shared dev DB drift
Tests run against the live `DATABASE_URL`. If a table the code expects is
missing ("relation X does not exist", e.g. `daily_quiz_sets`), the dev DB has
drifted from the committed schema — sync it with
`pnpm --filter @workspace/db push` (drizzle-kit push). Typecheck of an artifact
reads lib `dist/*.d.ts`; if a newly-added schema export doesn't resolve, rebuild
declarations with `pnpm run typecheck:libs` (`tsc --build`) at the repo root.
