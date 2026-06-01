---
name: Deployment must be Reserved VM, not autoscale
description: Why this app belongs on an always-on VM deployment and that the type can only be changed in the Publishing UI.
---

# Deploy BOC Study Notebook as Reserved VM (always-on), not autoscale

**Rule:** This project's published deployment should use deploymentTarget `vm` (Reserved VM / always-on), not `autoscale`.

**Why:** It's a timed mock-exam study app. On autoscale the server scales to zero when idle, so the first click after idle can return Replit's edge-level "invalid request" while the API cold-starts, and the background sweep timer (study-group) throws "Control plane request failed" against the DB during scale-down/teardown. State itself is safe on autoscale (sessions are cookie-based via `boc_sid`, all data in Postgres) — the problem is purely cold-start UX, which matters most when starting a timed exam.

**How to apply:**
- The deployment type **cannot be changed programmatically** and `.replit` cannot be edited directly. The user must switch it in the Publishing/Deployments pane (Deployment type → Reserved VM) and then re-publish.
- `deployConfig()` does not exist in the code-execution sandbox; do not attempt it.
- No code change is required for the fix; on VM the always-on process eliminates both the cold-start failures and the teardown control-plane errors.
