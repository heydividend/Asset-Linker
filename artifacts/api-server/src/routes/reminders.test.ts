import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, inArray, like } from "drizzle-orm";
import webpush from "web-push";
import { db, pushSubscriptions, reminderPrefs } from "@workspace/db";
import app from "../app";
import { runReminderTick } from "../lib/reminderScheduler";
import { nowHHmmPT, todayStrPT } from "../lib/today";
import type { PushPayload } from "../lib/webPush";

const keys = webpush.generateVAPIDKeys();

let server: Server;
let baseUrl: string;

const EP_PREFIX = "https://example.invalid/route/";

// Every session id any test client is handed, so afterEach can purge the rows
// (anonymous ids are random, so we can't match them by a prefix).
const touchedSessions = new Set<string>();

// Each client gets its own unique boc_sid id up front. Under the auth model
// the server no longer mints anonymous sessions, so the cookie is the client's
// stable identity (the test-auth bypass reads boc_sid as the user id), which
// keeps each Client isolated from the others exactly like separate users.
let clientSeq = 0;
class Client {
  private cookie: string | null = `boc_sid=test-rem-${Date.now()}-${clientSeq++}-${Math.random()
    .toString(36)
    .slice(2)}`;

  async req(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cookie) headers["cookie"] = this.cookie;
    const res = await fetch(baseUrl + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) this.cookie = setCookie.split(";")[0];
    const id = this.sessionId;
    if (id) touchedSessions.add(id);
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }

  get sessionId(): string | null {
    if (!this.cookie) return null;
    const idx = this.cookie.indexOf("=");
    return idx >= 0 ? decodeURIComponent(this.cookie.slice(idx + 1)) : null;
  }
}

async function cleanup(): Promise<void> {
  const ids = [...touchedSessions];
  if (ids.length > 0) {
    await db.delete(reminderPrefs).where(inArray(reminderPrefs.sessionId, ids));
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.sessionId, ids));
  }
  await db
    .delete(pushSubscriptions)
    .where(like(pushSubscriptions.endpoint, `${EP_PREFIX}%`));
  touchedSessions.clear();
}

// The routes derive a fresh session id from a cookie; to control the row we
// assert on, we read back by the session id the client was assigned.
async function getPrefBySession(sessionId: string) {
  const [row] = await db
    .select()
    .from(reminderPrefs)
    .where(inArray(reminderPrefs.sessionId, [sessionId]));
  return row;
}

describe("reminder routes", () => {
  before(async () => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
    process.env["VAPID_PUBLIC_KEY"] = keys.publicKey;
    process.env["VAPID_PRIVATE_KEY"] = keys.privateKey;
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(cleanup);

  after(async () => {
    await cleanup();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const { pool } = await import("@workspace/db");
    await pool.end();
  });

  describe("GET/PUT /reminders/preferences", () => {
    it("returns the default preference (disabled, 08:00) for a new session", async () => {
      const c = new Client();
      const res = await c.req("GET", "/api/reminders/preferences");
      assert.equal(res.status, 200);
      assert.equal(res.json.enabled, false);
      assert.equal(res.json.time, "08:00");
      assert.ok(c.sessionId, "a session cookie should be issued");
    });

    it("persists an updated preference and reads it back", async () => {
      const c = new Client();
      // Establish a session first.
      await c.req("GET", "/api/reminders/preferences");
      const put = await c.req("PUT", "/api/reminders/preferences", {
        enabled: true,
        time: "20:30",
      });
      assert.equal(put.status, 200);
      assert.equal(put.json.enabled, true);
      assert.equal(put.json.time, "20:30");

      const get = await c.req("GET", "/api/reminders/preferences");
      assert.equal(get.json.enabled, true);
      assert.equal(get.json.time, "20:30");
    });

    it("rejects a non-boolean enabled with 400", async () => {
      const c = new Client();
      await c.req("GET", "/api/reminders/preferences");
      const res = await c.req("PUT", "/api/reminders/preferences", {
        enabled: "yes",
        time: "08:00",
      });
      assert.equal(res.status, 400);
    });

    it("rejects a malformed time with 400", async () => {
      const c = new Client();
      await c.req("GET", "/api/reminders/preferences");
      const res = await c.req("PUT", "/api/reminders/preferences", {
        enabled: true,
        time: "7am",
      });
      assert.equal(res.status, 400);
    });

    it("enabling for a time that already passed does NOT fire immediately (stamps lastSentDate)", async () => {
      const c = new Client();
      await c.req("GET", "/api/reminders/preferences");

      // Choose a time guaranteed to be <= now in PT (one minute before now,
      // or 00:00 if it's just after midnight) so the "already passed" branch runs.
      const now = nowHHmmPT();
      const pastTime = now;

      const put = await c.req("PUT", "/api/reminders/preferences", {
        enabled: true,
        time: pastTime,
      });
      assert.equal(put.status, 200);

      const row = await getPrefBySession(c.sessionId!);
      assert.equal(
        row.lastSentDate,
        todayStrPT(),
        "enabling for a passed time should pre-stamp today so no catch-up fires",
      );

      // A scheduler pass right now must therefore NOT push to this session.
      const sentTo: string[] = [];
      await runReminderTick({
        now,
        today: todayStrPT(),
        buildPayload: async (): Promise<PushPayload> => ({ title: "t", body: "b" }),
        sendPush: async (sessionId: string) => {
          sentTo.push(sessionId);
          return 1;
        },
      });
      assert.equal(
        sentTo.includes(c.sessionId!),
        false,
        "no immediate catch-up reminder should be sent",
      );
    });

    it("enabling for a future time leaves lastSentDate unset so it can fire later", async () => {
      const c = new Client();
      await c.req("GET", "/api/reminders/preferences");
      const put = await c.req("PUT", "/api/reminders/preferences", {
        enabled: true,
        time: "23:59",
      });
      assert.equal(put.status, 200);

      const row = await getPrefBySession(c.sessionId!);
      // If "now" is exactly 23:59 PT this could be stamped; treat that edge as ok.
      if (nowHHmmPT() < "23:59") {
        assert.equal(row.lastSentDate, null);
      }
    });
  });

  describe("POST /reminders/subscribe and /unsubscribe", () => {
    const sub = (n: string) => ({
      endpoint: `${EP_PREFIX}${n}`,
      keys: { p256dh: "p256dh-key", auth: "auth-key" },
    });

    async function subRows(endpoint: string) {
      return db
        .select()
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.endpoint, endpoint));
    }

    it("stores a valid subscription and returns 201", async () => {
      const c = new Client();
      const body = sub("a");
      const res = await c.req("POST", "/api/reminders/subscribe", body);
      assert.equal(res.status, 201);
      assert.deepEqual(res.json, { ok: true });

      const rows = await subRows(body.endpoint);
      assert.equal(rows.length, 1);
      assert.equal(rows[0].sessionId, c.sessionId);
      assert.equal(rows[0].p256dh, "p256dh-key");
    });

    it("rejects an invalid subscription with 400", async () => {
      const c = new Client();
      const res = await c.req("POST", "/api/reminders/subscribe", {
        endpoint: `${EP_PREFIX}bad`,
      });
      assert.equal(res.status, 400);
      assert.equal((await subRows(`${EP_PREFIX}bad`)).length, 0);
    });

    it("re-keys an existing endpoint to the new session in place (dedupe on endpoint)", async () => {
      const body = sub("shared");
      const first = new Client();
      await first.req("POST", "/api/reminders/subscribe", body);
      const second = new Client();
      await second.req("POST", "/api/reminders/subscribe", body);

      const rows = await subRows(body.endpoint);
      assert.equal(rows.length, 1, "the unique endpoint should never duplicate");
      assert.equal(
        rows[0].sessionId,
        second.sessionId,
        "the latest browser to claim the endpoint owns it",
      );
    });

    it("removes a subscription on unsubscribe", async () => {
      const c = new Client();
      const body = sub("remove");
      await c.req("POST", "/api/reminders/subscribe", body);
      assert.equal((await subRows(body.endpoint)).length, 1);

      const res = await c.req("POST", "/api/reminders/unsubscribe", {
        endpoint: body.endpoint,
      });
      assert.equal(res.status, 200);
      assert.deepEqual(res.json, { ok: true });
      assert.equal((await subRows(body.endpoint)).length, 0);
    });

    it("rejects unsubscribe without an endpoint with 400", async () => {
      const c = new Client();
      const res = await c.req("POST", "/api/reminders/unsubscribe", {});
      assert.equal(res.status, 400);
    });
  });
});
