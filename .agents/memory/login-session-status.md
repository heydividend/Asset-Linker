---
name: Login session status & duration
description: How "still logged in" and session duration are determined for admin views
---

Rule: local `login_sessions` rows never record logout — the web client posts a ONE-SHOT heartbeat on app mount, so `lastSeenAt` is just the last mount, not last activity. Clerk is the only authority for "still signed in": query `clerkClient.sessions.getSessionList({ status: "active" })` (paginate; a single page undercounts) and match by `clerkSessionId`.

**Why:** presenting lastSeenAt-based status would silently misreport logouts/expiry; a fixed limit=200 misclassifies active sessions as logged out at scale.

**How to apply:** any "online users" / session-duration / last-active feature must treat durations as an approximate observed-activity window (say so in the UI) and degrade to "Unknown" (null), never guess, when the Clerk lookup fails.
