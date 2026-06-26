import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pushSubscriptions, reminderPrefs } from "@workspace/db";
import { getOrCreateSessionId } from "../lib/sessionId";
import { getVapidPublicKey, sendPushToSession } from "../lib/webPush";
import { buildReminderPayload } from "../lib/reminderSummary";
import { nowHHmmPT, todayStrPT } from "../lib/today";

const router: IRouter = Router();

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

async function getOrCreatePref(sessionId: string) {
  const [row] = await db
    .select()
    .from(reminderPrefs)
    .where(eq(reminderPrefs.sessionId, sessionId))
    .limit(1);
  if (row) return row;
  const [created] = await db
    .insert(reminderPrefs)
    .values({ sessionId })
    .onConflictDoNothing({ target: reminderPrefs.sessionId })
    .returning();
  if (created) return created;
  const [existing] = await db
    .select()
    .from(reminderPrefs)
    .where(eq(reminderPrefs.sessionId, sessionId))
    .limit(1);
  return existing;
}

// Public VAPID key the browser needs to create a push subscription.
router.get("/reminders/vapid-public-key", (_req, res): void => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Web Push is not configured on the server." });
    return;
  }
  res.json({ publicKey: key });
});

// Current reminder preference for this session.
router.get("/reminders/preferences", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const pref = await getOrCreatePref(sessionId);
  res.json({ enabled: pref.enabled, time: pref.time });
});

// Update reminder preference (enable/disable + chosen time).
router.put("/reminders/preferences", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const { enabled, time } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be a boolean" });
    return;
  }
  if (typeof time !== "string" || !TIME_RE.test(time)) {
    res.status(400).json({ error: "time must be HH:MM (24h)" });
    return;
  }
  // Ensure a row exists.
  await getOrCreatePref(sessionId);
  // When enabling for a time that has already passed today, stamp lastSentDate
  // to today so the scheduler doesn't fire an immediate "catch-up" reminder —
  // the first one should land tomorrow at the chosen time.
  const alreadyPassed = enabled && nowHHmmPT() >= time;
  const [row] = await db
    .update(reminderPrefs)
    .set({
      enabled,
      time,
      ...(alreadyPassed ? { lastSentDate: todayStrPT() } : {}),
      updatedAt: new Date(),
    })
    .where(eq(reminderPrefs.sessionId, sessionId))
    .returning();
  res.json({ enabled: row.enabled, time: row.time });
});

// Save (or refresh) a browser's push subscription for this session.
router.post("/reminders/subscribe", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const sub = req.body ?? {};
  const endpoint: unknown = sub.endpoint;
  const p256dh: unknown = sub.keys?.p256dh;
  const auth: unknown = sub.keys?.auth;
  if (
    typeof endpoint !== "string" ||
    typeof p256dh !== "string" ||
    typeof auth !== "string"
  ) {
    res.status(400).json({ error: "Invalid push subscription" });
    return;
  }
  // Re-key the subscription to this session and refresh its keys. Endpoint is
  // globally unique per browser, so a returning browser updates in place.
  await db
    .insert(pushSubscriptions)
    .values({ sessionId, endpoint, p256dh, auth })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: { sessionId, p256dh, auth },
    });
  res.status(201).json({ ok: true });
});

// Remove a browser's push subscription (best-effort).
router.post("/reminders/unsubscribe", async (req, res): Promise<void> => {
  getOrCreateSessionId(req, res);
  const endpoint: unknown = (req.body ?? {}).endpoint;
  if (typeof endpoint !== "string") {
    res.status(400).json({ error: "endpoint is required" });
    return;
  }
  await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint));
  res.json({ ok: true });
});

// Send a one-off test reminder to this session's browsers right now, so the
// user can confirm notifications actually arrive after enabling them.
router.post("/reminders/test", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const payload = await buildReminderPayload(sessionId);
  const count = await sendPushToSession(sessionId, payload);
  res.json({ sent: count });
});

export default router;
