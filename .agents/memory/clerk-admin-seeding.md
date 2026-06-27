---
name: Clerk admin gating & mastery seeding
description: How admin access is decided, and how to programmatically create Clerk users + seed baseline domain mastery for this app.
---

# Admin gating
- Admin status is email-based, not a Clerk role/flag. `api-server/src/lib/admin.ts` reads `ADMIN_EMAILS` (comma-separated, case-insensitive) and falls back to a hardcoded `DEFAULT_ADMIN` constant when unset, so the dashboard is never locked out. (See that file for the current owner email — not duplicated here.)
- `requireAdmin` depends on `req.userId` set by `requireAuth`; `routes/index.ts` mounts the admin/me routers AFTER the global `requireAuth`, so ordering is what keeps `/admin/*`, `/me`, `/session/heartbeat` authenticated. Don't move those mounts above `requireAuth`.
- To make someone admin in prod, set `ADMIN_EMAILS` (don't rely only on the default).

# Creating Clerk users programmatically
- `@clerk/express` (and thus `clerkClient`) only resolves inside the `artifacts/api-server` package — NOT from the workspace root, so the `code_execution` sandbox (cwd = root) CANNOT `import('@clerk/express')`. Run a Node `.mjs` script from `artifacts/api-server/` instead (it has `CLERK_SECRET_KEY` in env).
- Use `clerkClient.users.createUser({ emailAddress:[email], password, skipPasswordChecks:true })`; for re-runs, look up via `getUserList({emailAddress:[email]})` then `updateUser` to stay idempotent.

# Seeding baseline domain mastery
- Bands come from `scaledScore.ts`: passPercent=75, marginal zone width=10 → percent <65 = "considerably lower", 65–74 = "marginally lower", ≥75 = "at or above passing".
- Domain percent on the dashboard = SUM(correct)/SUM(attempts) over that domain's `topic_mastery` rows (the `mastery` float is only used for weak-topic flags, not the domain %). So to hit a band, set correct/attempts per row: 10/20 (=50%) for considerably-lower, 14/20 (=70%) for marginally-lower.
- `topics` and `tasks` both carry `domain_id`; seed `topic_mastery` and `task_mastery` straight from those tables with a CASE on domain_id. Both tables have `(user_id, *_id)` unique constraints, so upsert or delete-then-insert keyed by the Clerk user id.
