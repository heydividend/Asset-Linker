---
name: API server dev restart
description: Why backend changes in the boc-notebook api-server don't appear until you restart the workflow.
---

The `artifacts/api-server` dev workflow runs `pnpm run build && pnpm run start`
(NODE_ENV=development), not a watcher. New/changed Express routes and schema
imports are NOT hot-reloaded.

**Why:** A newly added route (e.g. GET /blueprint) returned as if missing and the
frontend page hung on "Loading…" until the api-server workflow was restarted, even
though the web (vite) workflow had been restarted.

**How to apply:** After editing anything under `artifacts/api-server/src`, restart
the `artifacts/api-server: API Server` workflow before testing. Restarting only the
web workflow is not enough.
