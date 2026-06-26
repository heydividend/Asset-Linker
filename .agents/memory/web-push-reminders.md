---
name: Web Push daily reminders
description: How daily study reminders fire (PT scheduling, per-day dedupe, no immediate catch-up)
---

Daily study reminders are delivered via Web Push (VAPID keys in shared env: VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT). An in-process scheduler ticks every 60s.

**Scheduling rule:** a reminder fires when `nowHHmmPT() >= pref.time` AND `lastSentDate != todayStrPT()`. Times are stored "HH:MM" 24h in Pacific (the whole app is PT-based per `lib/today.ts`). Using `>=` (not exact-minute equality) means a missed minute (server down) still fires late that day.

**Why no immediate catch-up:** when a user enables reminders for a time that has *already passed today*, the PUT handler stamps `lastSentDate = today` so the scheduler skips today and the first reminder lands tomorrow. Without this, enabling at 3pm with an 8am time would fire instantly.
**Why stamp regardless of send count:** the scheduler stamps `lastSentDate` even when 0 subscriptions accepted, so a session with all-expired subscriptions isn't retried every minute.

**How to apply:** any change to reminder timing must preserve both the dedupe-per-day and the already-passed stamp, or users get duplicate or instant-on-enable notifications. Push subscriptions are keyed by session (anonymous `boc_sid` cookie); 404/410 sends prune the dead subscription row.
