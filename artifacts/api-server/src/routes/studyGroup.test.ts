import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  studyGroupMessages,
  studyGroupSessions,
} from "@workspace/db";
import {
  recoverStuckStudyGroupRounds,
  sessionAborters,
  sweepStaleStudyGroupRounds,
} from "./studyGroup";

interface SeedRow {
  speaker?: string;
  kind?: string;
  content?: string;
  status: "pending" | "streaming" | "done" | "failed";
  updatedAt: Date;
  roundIndex?: number;
  turnOrder?: number;
}

const STALE_MS = 2 * 60 * 1000;
// Anchor to wall-clock time so that the production code's `new Date()` (used
// when refreshing updatedAt) is strictly greater than STALE/FRESH.
const NOW = new Date();
const STALE = new Date(NOW.getTime() - STALE_MS - 5_000);
const FRESH = new Date(NOW.getTime() - 30_000);

let createdSessionIds: number[] = [];

async function createSession(title: string): Promise<number> {
  const [row] = await db
    .insert(studyGroupSessions)
    .values({ title })
    .returning({ id: studyGroupSessions.id });
  createdSessionIds.push(row.id);
  return row.id;
}

async function seedMessage(sessionId: number, row: SeedRow): Promise<number> {
  const [m] = await db
    .insert(studyGroupMessages)
    .values({
      sessionId,
      speaker: row.speaker ?? "mentor",
      kind: row.kind ?? "question",
      content: row.content ?? "",
      status: row.status,
      roundIndex: row.roundIndex ?? 0,
      turnOrder: row.turnOrder ?? 0,
      updatedAt: row.updatedAt,
      createdAt: row.updatedAt,
    })
    .returning({ id: studyGroupMessages.id });
  return m.id;
}

async function getMessage(id: number) {
  const [row] = await db
    .select()
    .from(studyGroupMessages)
    .where(eq(studyGroupMessages.id, id));
  return row;
}

async function cleanupCreated(): Promise<void> {
  if (createdSessionIds.length === 0) return;
  // Cascade deletes the messages.
  await db
    .delete(studyGroupSessions)
    .where(inArray(studyGroupSessions.id, createdSessionIds));
  createdSessionIds = [];
}

describe("stuck-round healing logic", () => {
  before(() => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
  });

  afterEach(async () => {
    sessionAborters.clear();
    await cleanupCreated();
  });

  after(async () => {
    sessionAborters.clear();
    await cleanupCreated();
  });

  describe("sweepStaleStudyGroupRounds()", () => {
    it("flips a stale streaming row to 'failed' and refreshes updatedAt", async () => {
      const sessionId = await createSession("sweep stale streaming");
      const msgId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: STALE,
      });

      const updated = await sweepStaleStudyGroupRounds(NOW);
      assert.equal(updated, 1);

      const row = await getMessage(msgId);
      assert.equal(row.status, "failed");
      assert.ok(
        row.updatedAt.getTime() > STALE.getTime(),
        `updatedAt should be refreshed (was ${row.updatedAt.toISOString()})`,
      );
    });

    it("stamps reason='sweeper_timeout' on the swept row so the dashboard can explain it", async () => {
      // Pinning this contract guards the user-facing timeout banner: the
      // dashboard only renders <sg-sweeper-timeout-banner> when it sees
      // reason === 'sweeper_timeout'. If a future refactor changes the
      // sentinel string (or drops the column write), this test fails loudly
      // instead of silently breaking the explanation in the UI.
      const sessionId = await createSession("sweep stamps reason");
      const msgId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: STALE,
      });

      const updated = await sweepStaleStudyGroupRounds(NOW);
      assert.equal(updated, 1);

      const row = await getMessage(msgId);
      assert.equal(row.status, "failed");
      assert.equal(row.reason, "sweeper_timeout");
    });

    it("does not set reason on rows it leaves alone", async () => {
      const sessionId = await createSession("sweep preserves untouched reason");
      const freshId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: FRESH,
      });

      await sweepStaleStudyGroupRounds(NOW);

      const row = await getMessage(freshId);
      assert.equal(row.status, "streaming");
      assert.equal(row.reason, null);
    });

    it("leaves recent (non-stale) streaming rows alone", async () => {
      const sessionId = await createSession("sweep recent streaming");
      const msgId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: FRESH,
      });

      const updated = await sweepStaleStudyGroupRounds(NOW);
      assert.equal(updated, 0);

      const row = await getMessage(msgId);
      assert.equal(row.status, "streaming");
      assert.equal(row.updatedAt.getTime(), FRESH.getTime());
    });

    it("does NOT sweep a stale row whose session is in sessionAborters", async () => {
      const sessionId = await createSession("sweep owned session");
      const msgId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: STALE,
      });
      sessionAborters.set(sessionId, new AbortController());

      const updated = await sweepStaleStudyGroupRounds(NOW);
      assert.equal(updated, 0);

      const row = await getMessage(msgId);
      assert.equal(row.status, "streaming");
      assert.equal(row.updatedAt.getTime(), STALE.getTime());
    });

    it("ignores rows that are not in 'streaming' state", async () => {
      const sessionId = await createSession("sweep non-streaming");
      const doneId = await seedMessage(sessionId, {
        status: "done",
        updatedAt: STALE,
      });
      const failedId = await seedMessage(sessionId, {
        status: "failed",
        updatedAt: STALE,
      });
      const pendingId = await seedMessage(sessionId, {
        status: "pending",
        updatedAt: STALE,
      });

      const updated = await sweepStaleStudyGroupRounds(NOW);
      assert.equal(updated, 0);

      const done = await getMessage(doneId);
      const failed = await getMessage(failedId);
      const pending = await getMessage(pendingId);
      assert.equal(done.status, "done");
      assert.equal(failed.status, "failed");
      assert.equal(pending.status, "pending");
    });

    it("only sweeps the stale rows when both stale and fresh streaming rows exist", async () => {
      const sessionId = await createSession("sweep mixed");
      const staleId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: STALE,
        turnOrder: 0,
      });
      const freshId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: FRESH,
        turnOrder: 1,
      });

      const updated = await sweepStaleStudyGroupRounds(NOW);
      assert.equal(updated, 1);

      const stale = await getMessage(staleId);
      const fresh = await getMessage(freshId);
      assert.equal(stale.status, "failed");
      assert.equal(fresh.status, "streaming");
    });
  });

  describe("recoverStuckStudyGroupRounds()", () => {
    it("flips ALL streaming rows to 'failed' regardless of age and refreshes updatedAt", async () => {
      const sessionId = await createSession("recover all streaming");
      const oldId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: STALE,
        turnOrder: 0,
      });
      const youngId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: FRESH,
        turnOrder: 1,
      });
      const doneId = await seedMessage(sessionId, {
        status: "done",
        updatedAt: STALE,
        turnOrder: 2,
      });

      const recovered = await recoverStuckStudyGroupRounds();
      assert.ok(
        recovered >= 2,
        `expected at least 2 recovered rows, got ${recovered}`,
      );

      const oldRow = await getMessage(oldId);
      const youngRow = await getMessage(youngId);
      const doneRow = await getMessage(doneId);
      assert.equal(oldRow.status, "failed");
      assert.equal(youngRow.status, "failed");
      assert.equal(doneRow.status, "done");
      assert.ok(oldRow.updatedAt.getTime() > STALE.getTime());
      assert.ok(youngRow.updatedAt.getTime() > FRESH.getTime());
    });

    it("ignores sessionAborters — startup recovery flips even owned rows", async () => {
      // recoverStuckStudyGroupRounds() runs at process startup, before any
      // handler could possibly own a session, so by design it does NOT
      // consult sessionAborters. This test pins that contract.
      const sessionId = await createSession("recover ignores aborters");
      const msgId = await seedMessage(sessionId, {
        status: "streaming",
        updatedAt: FRESH,
      });
      sessionAborters.set(sessionId, new AbortController());

      await recoverStuckStudyGroupRounds();

      const row = await getMessage(msgId);
      assert.equal(row.status, "failed");
    });
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
