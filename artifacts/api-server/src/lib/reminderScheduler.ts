import { eq } from "drizzle-orm";
import { db, reminderPrefs } from "@workspace/db";
import { logger } from "./logger";
import {
  isValidTimeZone,
  nowHHmmInTz,
  todayStrInTz,
  weekdayInTz,
} from "./today";
import { buildReminderPayload } from "./reminderSummary";
import {
  ensureWebPushConfigured,
  sendPushToSession,
  type PushPayload,
} from "./webPush";

const TICK_INTERVAL_MS = 60 * 1000;
const DEFAULT_TZ = "America/Los_Angeles";

// Seams that tests can override to exercise the scheduling/dedupe logic
// without doing real Web Push sends or building a full plan summary. In
// production these default to the real implementations.
export interface ReminderTickDeps {
  now?: string;
  today?: string;
  buildPayload?: (sessionId: string) => Promise<PushPayload>;
  sendPush?: (sessionId: string, payload: PushPayload) => Promise<number>;
}

// One scheduler pass: find every enabled reminder whose chosen time has
// arrived (in that session's timezone) and that hasn't been sent yet today,
// build a fresh plan summary, push it to all of that session's browsers, and
// stamp lastSentDate so we never double-send within a day. Using ">=" (rather
// than exact-minute equality) means a reminder still fires — late — if the
// server happened to be down at the exact minute. Weekdays the user silenced
// are skipped entirely.
export async function runReminderTick(deps: ReminderTickDeps = {}): Promise<number> {
  if (!ensureWebPushConfigured()) return 0;
  const buildPayload = deps.buildPayload ?? buildReminderPayload;
  const sendPush = deps.sendPush ?? sendPushToSession;

  const due = await db
    .select()
    .from(reminderPrefs)
    .where(eq(reminderPrefs.enabled, true));

  let sentSessions = 0;
  for (const pref of due) {
    const tz =
      pref.timezone && isValidTimeZone(pref.timezone)
        ? pref.timezone
        : DEFAULT_TZ;
    const today = deps.today ?? todayStrInTz(tz);
    const nowHHmm = deps.now ?? nowHHmmInTz(tz);
    if (pref.lastSentDate === today) continue;
    if (nowHHmm < pref.time) continue;
    // Honor silenced weekdays (0=Sunday … 6=Saturday in the user's timezone).
    // Stamp lastSentDate so we don't re-check this session every minute today.
    if ((pref.skippedDays ?? []).includes(weekdayInTz(tz))) {
      await db
        .update(reminderPrefs)
        .set({ lastSentDate: today, updatedAt: new Date() })
        .where(eq(reminderPrefs.sessionId, pref.sessionId));
      continue;
    }
    try {
      const payload = await buildPayload(pref.sessionId);
      const count = await sendPush(pref.sessionId, payload);
      // Stamp regardless of count so we don't retry every minute for a session
      // whose subscriptions have all expired.
      await db
        .update(reminderPrefs)
        .set({ lastSentDate: today, updatedAt: new Date() })
        .where(eq(reminderPrefs.sessionId, pref.sessionId));
      if (count > 0) sentSessions += 1;
    } catch (err) {
      logger.error(
        { err, sessionId: pref.sessionId },
        "Failed to send daily study reminder",
      );
    }
  }
  return sentSessions;
}

let tickTimer: NodeJS.Timeout | null = null;
export function startReminderScheduler(
  onError: (err: unknown) => void = () => {},
): () => void {
  if (tickTimer) return () => stopReminderScheduler();
  const tick = async () => {
    try {
      await runReminderTick();
    } catch (err) {
      onError(err);
    }
  };
  tickTimer = setInterval(() => {
    void tick();
  }, TICK_INTERVAL_MS);
  // Don't keep the process alive solely for the reminder timer.
  tickTimer.unref?.();
  return () => stopReminderScheduler();
}

export function stopReminderScheduler(): void {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}
