---
name: Testing harness Clerk auth + slow-generation pages
description: How to keep Playwright runTest mobile/e2e audits from failing on Clerk auth or AI-generation latency in BOC Notebook.
---

# Testing harness: Clerk auth + slow-generation pages

When running `runTest` (Playwright subagent) against BOC Notebook:

- Pass `testClerkAuth: true` and sign in ONLY via the `[Clerk Auth]` step. The agent
  sometimes ignores that step and tries the real `/sign-in` UI, which fails with
  "Couldn't find your account." because public sign-up is disabled.
  **Fix:** put an explicit instruction in the test plan: do NOT navigate to /sign-in,
  do NOT type into the email/password form, never touch the Clerk UI — auth is handled
  by `[Clerk Auth]`. With that line the run succeeds.
- The Daily Quiz (`/daily-quiz`) generates 50 fresh questions via Claude and can take
  ~up to a minute; its own UI says so. e2e/mobile-layout audits must NOT start it or
  wait on any "Building…/generating" loading state, or the run stalls and reports
  failure on a non-bug. Audit static-layout pages instead (dashboard, /quiz, /blueprint,
  /schedule, /notebooks, /mock-exam, /games, /tutor).

**Why:** two separate runs failed for these exact reasons before a third succeeded.
**How to apply:** bake both rules into every BOC Notebook runTest plan up front.
