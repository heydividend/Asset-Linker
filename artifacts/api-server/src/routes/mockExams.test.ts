import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, domains, planCompletions } from "@workspace/db";
import { getOrCreateSchedule } from "../lib/planSchedule";
import { buildSchedule } from "../lib/scheduleBuilder";
import { getDomainMasteryMap } from "../lib/domainMastery";
import { listCompletedKeys, markPlanItemComplete } from "../lib/planCompletions";
import { linkMockSubmissionToPlan } from "./mockExams";

// Use a session id unique to this test run so the rows we create can never
// collide with real user data and are trivially cleaned up by session id.
const TEST_SESSION = `test-mock-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Resolve a real scheduled simulated-exam day and a real non-mock day from the
// active plan, so the tests exercise the actual schedule the submit handler
// sees rather than hand-built dates.
async function findMockAndNonMockDays(): Promise<{
  mockDate: string;
  nonMockDate: string;
}> {
  const sched = await getOrCreateSchedule();
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap();
  const days = buildSchedule(
    sched.startDate,
    sched.examDate,
    dRows,
    masteryByDomainId,
  );
  const mockDay = days.find((d) =>
    d.items.some((it) => it.kind === "mock_exam"),
  );
  const nonMockDay = days.find(
    (d) => !d.items.some((it) => it.kind === "mock_exam"),
  );
  if (!mockDay) {
    throw new Error("schedule has no simulated-exam day to test against");
  }
  if (!nonMockDay) {
    throw new Error("schedule has no non-mock day to test against");
  }
  return { mockDate: mockDay.date, nonMockDate: nonMockDay.date };
}

async function cleanup(): Promise<void> {
  await db
    .delete(planCompletions)
    .where(eq(planCompletions.sessionId, TEST_SESSION));
}

describe("mock-exam plan auto-completion", () => {
  before(() => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
  });

  afterEach(async () => {
    await cleanup();
  });

  after(async () => {
    await cleanup();
  });

  it("records the matching mock_exam:<date> completion when submitting on a scheduled mock day", async () => {
    const { mockDate } = await findMockAndNonMockDays();

    const key = await linkMockSubmissionToPlan(TEST_SESSION, mockDate);
    assert.equal(
      key,
      `mock_exam:${mockDate}`,
      "linking should return the per-day mock key so completion stays in lockstep with /plan/today",
    );

    const completed = await listCompletedKeys(TEST_SESSION, mockDate);
    assert.deepEqual(
      completed,
      [`mock_exam:${mockDate}`],
      "exactly the matching day's mock item should be auto-checked",
    );
  });

  it("records nothing when submitting on a non-mock day", async () => {
    const { nonMockDate } = await findMockAndNonMockDays();

    const key = await linkMockSubmissionToPlan(TEST_SESSION, nonMockDate);
    assert.equal(
      key,
      null,
      "a non-mock day has no mock_exam plan item, so linking is a no-op",
    );

    const completed = await listCompletedKeys(TEST_SESSION, nonMockDate);
    assert.deepEqual(
      completed,
      [],
      "no completion should be recorded on a day with no scheduled mock",
    );
  });

  it("is idempotent — submit followed by a manual mark complete does not double-count", async () => {
    const { mockDate } = await findMockAndNonMockDays();

    // Submission auto-checks the item.
    const key = await linkMockSubmissionToPlan(TEST_SESSION, mockDate);
    assert.equal(key, `mock_exam:${mockDate}`);

    // A later manual "mark complete" tap hits the same (session, date, key).
    const insertedAgain = await markPlanItemComplete(
      TEST_SESSION,
      mockDate,
      `mock_exam:${mockDate}`,
    );
    assert.equal(
      insertedAgain,
      false,
      "the manual mark must be a no-op insert since the row already exists",
    );

    // Submitting the same mock again (e.g. a retried request) also no-ops.
    await linkMockSubmissionToPlan(TEST_SESSION, mockDate);

    const rows = await db
      .select({ id: planCompletions.id })
      .from(planCompletions)
      .where(
        and(
          eq(planCompletions.sessionId, TEST_SESSION),
          eq(planCompletions.date, mockDate),
          eq(planCompletions.itemKey, `mock_exam:${mockDate}`),
        ),
      );
    assert.equal(
      rows.length,
      1,
      "exactly one completion row should exist despite multiple completions",
    );
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
