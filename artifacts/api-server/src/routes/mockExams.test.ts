import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, domains, planCompletions } from "@workspace/db";
import {
  earliestUncompletedPastMockKey,
  getOrCreateSchedule,
} from "../lib/planSchedule";
import { buildSchedule } from "../lib/scheduleBuilder";
import { getDomainMasteryMap } from "../lib/domainMastery";
import { planItemKey } from "../lib/planItemKey";
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
  const sched = await getOrCreateSchedule(TEST_SESSION);
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap(TEST_SESSION);
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

// Resolve the active plan's simulated-exam days in ascending date order, paired
// with the completion key /plan/today uses for each. We exercise the real
// schedule (rather than hand-built dates) so the make-up selection is tested
// against the days the submit handler actually sees.
async function mockDaysOfPlan(): Promise<{
  examDate: string;
  mocks: { date: string; key: string }[];
}> {
  const sched = await getOrCreateSchedule(TEST_SESSION);
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap(TEST_SESSION);
  const days = buildSchedule(
    sched.startDate,
    sched.examDate,
    dRows,
    masteryByDomainId,
  );
  const mocks: { date: string; key: string }[] = [];
  for (const day of days) {
    const mock = day.items.find((it) => it.kind === "mock_exam");
    if (mock) mocks.push({ date: day.date, key: planItemKey(mock) });
  }
  if (mocks.length < 2) {
    throw new Error(
      "plan needs at least two simulated-exam days to test make-up selection",
    );
  }
  // The exam (last) day has no mock_exam item, so every collected mock is
  // strictly before it — using it as `today` makes all mocks overdue.
  return { examDate: days[days.length - 1]!.date, mocks };
}

describe("make-up mock selection (earliestUncompletedPastMockKey)", () => {
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

  it("clears the earliest uncompleted past mock when a make-up is submitted on a non-mock day", async () => {
    const { examDate, mocks } = await mockDaysOfPlan();

    const key = await earliestUncompletedPastMockKey(TEST_SESSION, examDate);
    assert.equal(
      key,
      mocks[0]!.key,
      "with nothing completed, the oldest overdue simulated exam must be the one a make-up clears",
    );
  });

  it("never re-clears a mock already completed — advances to the next oldest", async () => {
    const { examDate, mocks } = await mockDaysOfPlan();

    // Record the oldest mock as completed on a later (make-up) day. Selection
    // keys off the through-today completion set, so a mock finished on any day
    // must be skipped regardless of which day cleared it.
    await markPlanItemComplete(TEST_SESSION, examDate, mocks[0]!.key);

    const key = await earliestUncompletedPastMockKey(TEST_SESSION, examDate);
    assert.equal(
      key,
      mocks[1]!.key,
      "the already-cleared mock must be skipped and the next oldest picked, so make-ups stay idempotent",
    );
  });

  it("is a no-op (null) when there are no overdue past mocks", async () => {
    const { mocks } = await mockDaysOfPlan();

    // Use the earliest mock day itself as `today`: that mock is not strictly in
    // the past and no mock precedes it, so nothing is overdue to clear.
    const key = await earliestUncompletedPastMockKey(
      TEST_SESSION,
      mocks[0]!.date,
    );
    assert.equal(
      key,
      null,
      "a make-up taken before any mock is overdue must clear nothing",
    );
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
