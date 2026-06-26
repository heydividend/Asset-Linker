---
name: Web Push daily reminders
description: How daily study reminders fire (PT scheduling, per-day dedupe, no immediate catch-up)
---

Daily study reminders are delivered via Web Push (VAPID keys in shared env: VAPID_PUBLIC_KEY/PRIVATE_KEY/SUBJECT). An in-process scheduler ticks every 60s.

**Scheduling rule:** a reminder fires when `nowHHmmPT() >= pref.time` AND `lastSentDate != todayStrPT()`. Times are stored "HH:MM" 24h in Pacific (the whole app is PT-based per `lib/today.ts`). Using `>=` (not exact-minute equality) means a missed minute (server down) still fires late that day.

**Why no immediate catch-up:** when a user enables reminders for a time that has *already passed today*, the PUT handler stamps `lastSentDate = today` so the scheduler skips today and the first reminder lands tomorrow. Without this, enabling at 3pm with an 8am time would fire instantly.
**Why stamp regardless of send count:** the scheduler stamps `lastSentDate` even when 0 subscriptions accepted, so a session with all-expired subscriptions isn't retried every minute.

**Per-user timezone + rest days:** reminder timing is interpreted in each pref's own `timezone` (IANA, default America/Los_Angeles), NOT global PT. The scheduler computes `today`/`nowHHmm`/`weekday` per-pref in that tz; the PUT already-passed stamp also uses the user's tz. `skippedDays` (jsonb int[], 0=Sun…6=Sat, JS getDay) silences weekdays — on a skipped day the scheduler still stamps `lastSentDate` so it doesn't re-check every minute. The app's *study day* rollover stays PT (lib/today.ts TZ); only reminders are per-user.

**How to apply:** any change to reminder timing must preserve both the dedupe-per-day (in the user's tz) and the already-passed stamp, or users get duplicate or instant-on-enable notifications. Push subscriptions are keyed by session (anonymous `boc_sid` cookie); 404/410 sends prune the dead subscription row.
