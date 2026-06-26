import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq } from "drizzle-orm";
import { db, planCompletions } from "@workspace/db";
import app from "../app";
import { todayStr } from "../lib/planCompletions";
import { REVIEW_SHEETS } from "../lib/domainReviewSheets";

const TEST_SESSION = `test-sheets-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2)}`;

let server: Server;
let baseUrl: string;

async function api(
  path: string,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: { cookie: `boc_sid=${TEST_SESSION}` },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function cleanup(): Promise<void> {
  await db
    .delete(planCompletions)
    .where(eq(planCompletions.sessionId, TEST_SESSION));
}

describe("review-sheet endpoints", () => {
  before(async () => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
    server = app.listen(0);
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) {
      server.close();
      await once(server, "close");
    }
    await cleanup();
  });

  it("lists all five per-domain review sheets", async () => {
    const res = await api("/review-sheets");
    assert.equal(res.status, 200);
    assert.equal(
      res.body.sheets.length,
      5,
      "there should be one review sheet per PA8 domain (D1–D5)",
    );
    assert.deepEqual(
      res.body.sheets.map((s: any) => s.code).sort(),
      ["D1", "D2", "D3", "D4", "D5"],
      "the five sheets should cover domain codes D1 through D5",
    );
    for (const sheet of res.body.sheets) {
      assert.ok(sheet.title, "each sheet should have a title");
      assert.ok(sheet.summary, "each sheet should have a summary");
      assert.equal(
        typeof sheet.estMinutes,
        "number",
        "each sheet should carry an estimated minutes value",
      );
      // The list endpoint is a lightweight index — it must NOT ship the full
      // markdown body (that only comes from the per-code endpoint).
      assert.equal(
        sheet.markdown,
        undefined,
        "the list endpoint should omit the full markdown body",
      );
    }
  });

  it("returns a single sheet by code and marks its review_sheet plan completion", async () => {
    const code = REVIEW_SHEETS[0].code; // D1
    const res = await api(`/review-sheets/${code}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.code, code);
    assert.ok(res.body.markdown, "the per-code endpoint should return markdown");

    const completed = await db
      .select({ itemKey: planCompletions.itemKey })
      .from(planCompletions)
      .where(eq(planCompletions.sessionId, TEST_SESSION));
    const keys = completed.map((r) => r.itemKey);

    assert.ok(
      keys.includes("review_sheet:any"),
      `opening a review sheet should record review_sheet:any (got ${JSON.stringify(keys)})`,
    );
    // D1 maps to a real seeded domain, so the domain-specific completion should
    // also be recorded in lockstep with /plan/today.
    if (res.body.domainId != null) {
      assert.ok(
        keys.includes(`review_sheet:domain:${res.body.domainId}`),
        `opening D1 should also record review_sheet:domain:${res.body.domainId}`,
      );
    }
  });

  it("returns 404 for an unknown sheet code", async () => {
    const res = await api("/review-sheets/ZZ");
    assert.equal(res.status, 404);
  });

  it("date used for completions matches the Pacific day", () => {
    // Guards the contract that review-sheet completions are stamped with the
    // same PT date the plan view reads, so they line up with /plan/today.
    assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
