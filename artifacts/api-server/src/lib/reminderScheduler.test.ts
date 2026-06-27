import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { inArray } from "drizzle-orm";
import webpush from "web-push";
import { db, reminderPrefs } from "@workspace/db";
import { runReminderTick } from "./reminderScheduler";
import type { PushPayload } from "./webPush";

// runReminderTick() no-ops unless Web Push is configured, so give it a real
// (throwaway) VAPID keypair. We never actually send — the sendPush dep is
// stubbed in every test — but ensureWebPushConfigured() validates the keys.
const keys = webpush.generateVAPIDKeys();

const PREFIX = `test-sched-${process.pid}-${Date.now()}-`;
let seeded: string[] = [];

function sid(name: string): string {
  const id = PREFIX + name;
  seeded.push(id);
  return id;
}

interface SeedPref {
  sessionId: string;
  enabled: boolean;
  time: string;
  lastSentDate?: string | null;
}

async function seedPref(p: SeedPref): Promise<void> {
  await db.insert(reminderPrefs).values({
    sessionId: p.sessionId,
    enabled: p.enabled,
    time: p.time,
    lastSentDate: p.lastSentDate ?? null,
  });
}

async function getPref(sessionId: string) {
  const [row] = await db
    .select()
    .from(reminderPrefs)
    .where(inArray(reminderPrefs.sessionId, [sessionId]));
  return row;
}

// A tick whose payload builder and push sender are stubbed: every send is
// recorded so we can assert exactly which sessions were pushed to.
function trackingTick(now: string, today: string) {
  const sentTo: string[] = [];
  const deps = {
    now,
    today,
    buildPayload: async (sessionId: string): Promise<PushPayload> => ({
      title: "t",
      body: `body-${sessionId}`,
    }),
    sendPush: async (sessionId: string): Promise<number> => {
      sentTo.push(sessionId);
      return 1;
    },
  };
  return { sentTo, run: () => runReminderTick(deps) };
}

describe("runReminderTick — daily reminder scheduling", () => {
  before(() => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
    process.env["VAPID_PUBLIC_KEY"] = keys.publicKey;
    process.env["VAPID_PRIVATE_KEY"] = keys.privateKey;
  });

  afterEach(async () => {
    if (seeded.length === 0) return;
    await db.delete(reminderPrefs).where(inArray(reminderPrefs.sessionId, seeded));
    seeded = [];
  });

  it("does NOT fire when the chosen time has not arrived yet", async () => {
    const s = sid("future");
    await seedPref({ sessionId: s, enabled: true, time: "20:00" });

    const { sentTo, run } = trackingTick("08:00", "2026-06-26");
    const count = await run();

    assert.equal(count, 0);
    assert.deepEqual(sentTo, []);
    const row = await getPref(s);
    assert.equal(row.lastSentDate, null, "must not stamp a reminder it didn't send");
  });

  it("fires once when the chosen time has arrived and stamps lastSentDate", async () => {
    const s = sid("due");
    await seedPref({ sessionId: s, enabled: true, time: "08:00" });

    const { sentTo, run } = trackingTick("08:00", "2026-06-26");
    const count = await run();

    assert.equal(count, 1);
    assert.deepEqual(sentTo, [s]);
    const row = await getPref(s);
    assert.equal(row.lastSentDate, "2026-06-26");
  });

  it("fires at most once per day — a second tick the same day is a no-op", async () => {
    const s = sid("once");
    await seedPref({ sessionId: s, enabled: true, time: "08:00" });

    const first = trackingTick("08:00", "2026-06-26");
    assert.equal(await first.run(), 1);
    assert.deepEqual(first.sentTo, [s]);

    // Later the same day, well past the chosen time: must NOT fire again.
    const second = trackingTick("23:59", "2026-06-26");
    assert.equal(await second.run(), 0);
    assert.deepEqual(second.sentTo, []);
  });

  it("fires again the next day once lastSentDate is no longer today", async () => {
    const s = sid("nextday");
    await seedPref({
      sessionId: s,
      enabled: true,
      time: "08:00",
      lastSentDate: "2026-06-26",
    });

    const { sentTo, run } = trackingTick("08:00", "2026-06-27");
    assert.equal(await run(), 1);
    assert.deepEqual(sentTo, [s]);
    const row = await getPref(s);
    assert.equal(row.lastSentDate, "2026-06-27");
  });

  it("does NOT fire for disabled reminders even when the time has arrived", async () => {
    const s = sid("disabled");
    await seedPref({ sessionId: s, enabled: false, time: "08:00" });

    const { sentTo, run } = trackingTick("23:59", "2026-06-26");
    assert.equal(await run(), 0);
    assert.deepEqual(sentTo, []);
  });

  it("does NOT send an immediate catch-up when lastSentDate is already today (past-time enable)", async () => {
    // This mirrors what PUT /reminders/preferences does when you enable a
    // reminder for a time that already passed: it stamps lastSentDate=today so
    // the scheduler skips the immediate fire and waits for tomorrow.
    const s = sid("catchup");
    await seedPref({
      sessionId: s,
      enabled: true,
      time: "08:00",
      lastSentDate: "2026-06-26",
    });

    const { sentTo, run } = trackingTick("20:00", "2026-06-26");
    assert.equal(await run(), 0);
    assert.deepEqual(sentTo, []);
  });

  it("counts only sessions whose subscriptions accepted the push", async () => {
    const live = sid("live");
    const dead = sid("dead");
    await seedPref({ sessionId: live, enabled: true, time: "08:00" });
    await seedPref({ sessionId: dead, enabled: true, time: "08:00" });

    // dead has no live subscriptions -> sendPush returns 0; it must still get
    // stamped so we don't retry it every minute.
    const count = await runReminderTick({
      now: "09:00",
      today: "2026-06-26",
      buildPayload: async (): Promise<PushPayload> => ({ title: "t", body: "b" }),
      sendPush: async (sessionId: string) => (sessionId === live ? 1 : 0),
    });

    assert.equal(count, 1, "only the session with a live subscription is counted");
    assert.equal((await getPref(dead)).lastSentDate, "2026-06-26");
    assert.equal((await getPref(live)).lastSentDate, "2026-06-26");
  });
});

after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
