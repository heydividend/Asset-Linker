import webpush from "web-push";
import { eq } from "drizzle-orm";
import { db, pushSubscriptions, type PushSubscription } from "@workspace/db";
import { logger } from "./logger";

let configured = false;

// Configure web-push with the VAPID keypair from the environment. Returns
// false (and logs once) when keys are missing so callers can no-op cleanly
// instead of throwing on every send.
export function ensureWebPushConfigured(): boolean {
  if (configured) return true;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:reminders@boc-notebook.app";
  if (!publicKey || !privateKey) {
    logger.warn(
      "VAPID keys are not configured; Web Push reminders are disabled.",
    );
    return false;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// Sends a payload to a single subscription. On a 404/410 (subscription gone),
// the dead row is deleted so we stop trying. Returns true on success.
async function sendToOne(
  sub: PushSubscription,
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
    );
    return true;
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await db
        .delete(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, sub.endpoint))
        .catch(() => {});
      logger.info({ endpoint: sub.endpoint }, "Pruned expired push subscription");
    } else {
      logger.error({ err, statusCode }, "Failed to send web push");
    }
    return false;
  }
}

// Pushes a payload to every subscription registered for a session. Returns the
// number of subscriptions that accepted the push.
export async function sendPushToSession(
  sessionId: string,
  payload: PushPayload,
): Promise<number> {
  if (!ensureWebPushConfigured()) return 0;
  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.sessionId, sessionId));
  if (subs.length === 0) return 0;
  const results = await Promise.all(subs.map((s) => sendToOne(s, payload)));
  return results.filter(Boolean).length;
}
