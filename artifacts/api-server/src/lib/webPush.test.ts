import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import webpush from "web-push";
import { db, pushSubscriptions } from "@workspace/db";
import { sendPushToSession, type PushPayload } from "./webPush";

const keys = webpush.generateVAPIDKeys();

const PREFIX = `test-push-${process.pid}-${Date.now()}-`;
let seededSessions: string[] = [];

const PAYLOAD: PushPayload = { title: "t", body: "b" };

function endpoint(name: string): string {
  return `https://example.invalid/push/${PREFIX}${name}`;
}

async function seedSub(sessionId: string, name: string): Promise<string> {
  const ep = endpoint(name);
  await db.insert(pushSubscriptions).values({
    sessionId,
    endpoint: ep,
    p256dh: "p256dh-key",
    auth: "auth-key",
  });
  return ep;
}

async function subExists(ep: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, ep));
  return rows.length > 0;
}

// Swap webpush.sendNotification for a stub. Returns a restore fn.
function stubSend(
  impl: (sub: { endpoint: string }) => Promise<unknown>,
): () => void {
  const original = webpush.sendNotification;
  // @ts-expect-error — overriding for the test
  webpush.sendNotification = (sub: { endpoint: string }) => impl(sub);
  return () => {
    webpush.sendNotification = original;
  };
}

describe("sendPushToSession — delivery + dead-subscription pruning", () => {
  before(() => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
    process.env["VAPID_PUBLIC_KEY"] = keys.publicKey;
    process.env["VAPID_PRIVATE_KEY"] = keys.privateKey;
  });

  afterEach(async () => {
    if (seededSessions.length === 0) return;
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.sessionId, seededSessions));
    seededSessions = [];
  });

  it("returns 0 and sends nothing when the session has no subscriptions", async () => {
    let calls = 0;
    const restore = stubSend(async () => {
      calls += 1;
      return undefined;
    });
    try {
      const sent = await sendPushToSession(`${PREFIX}empty`, PAYLOAD);
      assert.equal(sent, 0);
      assert.equal(calls, 0);
    } finally {
      restore();
    }
  });

  it("delivers to every live subscription and counts the successes", async () => {
    const s = `${PREFIX}live`;
    seededSessions.push(s);
    const a = await seedSub(s, "live-a");
    const b = await seedSub(s, "live-b");

    const restore = stubSend(async () => undefined);
    try {
      const sent = await sendPushToSession(s, PAYLOAD);
      assert.equal(sent, 2);
      assert.ok(await subExists(a));
      assert.ok(await subExists(b));
    } finally {
      restore();
    }
  });

  it("prunes a subscription that returns 410 Gone and does not count it", async () => {
    const s = `${PREFIX}gone`;
    seededSessions.push(s);
    const ep = await seedSub(s, "gone");

    const restore = stubSend(async () => {
      throw Object.assign(new Error("gone"), { statusCode: 410 });
    });
    try {
      const sent = await sendPushToSession(s, PAYLOAD);
      assert.equal(sent, 0);
      assert.equal(await subExists(ep), false, "410 must delete the dead row");
    } finally {
      restore();
    }
  });

  it("prunes a subscription that returns 404 Not Found", async () => {
    const s = `${PREFIX}notfound`;
    seededSessions.push(s);
    const ep = await seedSub(s, "notfound");

    const restore = stubSend(async () => {
      throw Object.assign(new Error("not found"), { statusCode: 404 });
    });
    try {
      const sent = await sendPushToSession(s, PAYLOAD);
      assert.equal(sent, 0);
      assert.equal(await subExists(ep), false, "404 must delete the dead row");
    } finally {
      restore();
    }
  });

  it("keeps a subscription that fails with a transient (non-404/410) error", async () => {
    const s = `${PREFIX}transient`;
    seededSessions.push(s);
    const ep = await seedSub(s, "transient");

    const restore = stubSend(async () => {
      throw Object.assign(new Error("server error"), { statusCode: 500 });
    });
    try {
      const sent = await sendPushToSession(s, PAYLOAD);
      assert.equal(sent, 0);
      assert.equal(
        await subExists(ep),
        true,
        "a 500 is transient — the row must be kept for the next attempt",
      );
    } finally {
      restore();
    }
  });

  it("prunes only the dead subscription, leaving live ones intact", async () => {
    const s = `${PREFIX}mixed`;
    seededSessions.push(s);
    const liveEp = await seedSub(s, "mixed-live");
    const deadEp = await seedSub(s, "mixed-dead");

    const restore = stubSend(async (sub) => {
      if (sub.endpoint === deadEp) {
        throw Object.assign(new Error("gone"), { statusCode: 410 });
      }
      return undefined;
    });
    try {
      const sent = await sendPushToSession(s, PAYLOAD);
      assert.equal(sent, 1);
      assert.equal(await subExists(liveEp), true);
      assert.equal(await subExists(deadEp), false);
    } finally {
      restore();
    }
  });
});

after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
