import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db, domains, planCompletions } from "@workspace/db";
import { getOrCreateSchedule } from "../lib/planSchedule";
import { buildSchedule, type ScheduleDay } from "../lib/scheduleBuilder";
import { getDomainMasteryMap } from "../lib/domainMastery";
import { isMandatoryKind, planItemKey } from "../lib/planItemKey";
import { markPlanItemComplete } from "../lib/planCompletions";
import {
  TODAY_ITEM_CAP,
  computeCarriedForwardItems,
  finalizeTodayList,
} from "./plan";
import type { PlanItem } from "../lib/scheduleBuilder";

// Session id unique to this test run so the rows we create can never collide
// with real user data and are trivially cleaned up by session id.
const TEST_SESSION = `test-carry-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Build the real active plan once. carry-forward only compares dates, and
// buildSchedule's per-day items don't depend on the real "today", so we can
// pick any `today` and the test stays deterministic regardless of the wall
// clock. We use the exam (last) day as `today` so every study day is in the
// past and is therefore eligible to be carried forward.
async function buildPlan(): Promise<{ days: ScheduleDay[]; today: string }> {
  const sched = await getOrCreateSchedule(TEST_SESSION);
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap(TEST_SESSION);
  const days = buildSchedule(
    sched.startDate,
    sched.examDate,
    dRows,
    masteryByDomainId,
  );
  const today = days[days.length - 1]!.date;
  return { days, today };
}

// The earliest past day holding a mandatory (non-rest) item, plus that item.
// Since this is the first past day with any non-rest item, its key's earliest
// occurrence is this very day, so carry-forward must tag it carriedFrom = here.
function firstMandatory(
  days: ScheduleDay[],
  today: string,
): { date: string; key: string } {
  for (const day of days) {
    if (day.date >= today) break;
    const item = day.items.find((it) => isMandatoryKind(it.kind));
    if (item) return { date: day.date, key: planItemKey(item) };
  }
  throw new Error("schedule has no past day with a mandatory item to test");
}

// The earliest past day that contains a rest item, so we can assert rest is
// never carried forward even though it appeared on a scheduled day.
function firstRestDay(days: ScheduleDay[], today: string): string {
  for (const day of days) {
    if (day.date >= today) break;
    if (day.items.some((it) => it.kind === "rest")) return day.date;
  }
  throw new Error("schedule has no past rest day to test against");
}

async function cleanup(): Promise<void> {
  await db
    .delete(planCompletions)
    .where(eq(planCompletions.sessionId, TEST_SESSION));
}

describe("Today list carry-forward of missed items", () => {
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

  it("carries a mandatory item left uncompleted on its scheduled day forward to a later day", async () => {
    const { days, today } = await buildPlan();
    const { date, key } = firstMandatory(days, today);

    const carried = await computeCarriedForwardItems(TEST_SESSION, days, today);
    const match = carried.find((it) => planItemKey(it) === key);

    assert.ok(
      match,
      "an uncompleted mandatory past item must resurface in the carried list",
    );
    assert.equal(
      match.carriedFrom,
      date,
      "the carried item must be tagged with its original (earliest) scheduled date",
    );
  });

  it("stops carrying the item forward once its matching completion is recorded on any day", async () => {
    const { days, today } = await buildPlan();
    const { key } = firstMandatory(days, today);

    // Record completion on a different (later) day than it was scheduled for —
    // listCompletedKeysThrough should still clear it, since carry-forward keys
    // off the activity, not the date it was finally finished.
    await markPlanItemComplete(TEST_SESSION, today, key);

    const carried = await computeCarriedForwardItems(TEST_SESSION, days, today);
    const match = carried.find((it) => planItemKey(it) === key);

    assert.equal(
      match,
      undefined,
      "a completed item must no longer be carried forward, regardless of which day it was completed on",
    );
  });

  it("never carries rest/optional items forward", async () => {
    const { days, today } = await buildPlan();
    // Sanity: there really is a past rest item that could be carried.
    firstRestDay(days, today);

    const carried = await computeCarriedForwardItems(TEST_SESSION, days, today);

    assert.ok(
      carried.every((it) => it.kind !== "rest"),
      "rest items expire with their day and must never be carried forward",
    );
    assert.ok(
      carried.every((it) => isMandatoryKind(it.kind)),
      "only mandatory items are eligible for carry-forward",
    );
  });
});

// These exercise the pure finalize step (/plan/today's dedupe + cap) directly,
// composing items exactly the way buildTodayItems does — today's native items
// first, carry-overs appended after — so the guarantees hold without standing
// up the full DB-backed handler.
describe("Today list dedupe + cap", () => {
  it("collapses a carry-over that shares a key with a native today item into a single native entry", () => {
    const todayNative: PlanItem = {
      kind: "study_group",
      title: "AI study group — today's focus",
      estMinutes: 25,
      domainId: 1,
      link: "/study-group",
    };
    // Same activity (identical key) that was missed earlier and carried in.
    const carriedDup: PlanItem = {
      ...todayNative,
      title: "AI study group — missed yesterday",
      carriedFrom: "2026-01-01",
    };

    // Mirror buildTodayItems: native first, carry-overs appended after.
    const out = finalizeTodayList([todayNative, carriedDup]);
    const key = planItemKey(todayNative);
    const matches = out.filter((it) => it.key === key);

    assert.equal(
      matches.length,
      1,
      "a carry-over sharing a key with a native item must appear only once",
    );
    assert.equal(
      matches[0]!.carriedFrom,
      undefined,
      "the surviving entry must be today's native item, not the carry-over",
    );
  });

  it("never drops today's mandatory items when many carry-overs pile up against the cap", () => {
    // A realistic spread of distinct today-native mandatory items.
    const todayNative: PlanItem[] = [
      { kind: "reading", title: "Read the BOC text", estMinutes: 30, domainId: 1 },
      { kind: "study_guide", title: "Study guide", estMinutes: 45, domainId: 1 },
      { kind: "flashcards", title: "Spaced-repetition session", estMinutes: 20 },
      { kind: "quiz", title: "Daily 50-question quiz", estMinutes: 50, daily: true },
      { kind: "review_sheet", title: "High-yield review sheet", estMinutes: 15, domainId: 1 },
      { kind: "game", title: "Quick game", estMinutes: 8, gameId: "today-game" },
      { kind: "study_group", title: "AI study group session", estMinutes: 25, domainId: 1 },
    ];
    // Far more carry-overs than the cap, each with a distinct key so none of
    // them dedupe against a native item or against each other.
    const carried: PlanItem[] = Array.from({ length: 40 }, (_, i) => ({
      kind: "game" as const,
      title: `Carried game ${i}`,
      estMinutes: 8,
      gameId: `carried-${i}`,
      carriedFrom: "2026-01-01",
    }));

    const out = finalizeTodayList([...todayNative, ...carried]);

    assert.equal(
      out.length,
      TODAY_ITEM_CAP,
      "the list must be capped at TODAY_ITEM_CAP",
    );
    for (const native of todayNative) {
      const key = planItemKey(native);
      assert.ok(
        out.some((it) => it.key === key && it.carriedFrom === undefined),
        `today's native ${native.kind} (${key}) must survive the cap`,
      );
    }
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
