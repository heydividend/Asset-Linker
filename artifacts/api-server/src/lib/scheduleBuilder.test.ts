import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Domain } from "@workspace/db";
import { buildSchedule, type ScheduleDay } from "./scheduleBuilder";
import { planItemKey } from "./planItemKey";

// Five fake domains matching the real BOC domain mix (equal weight here so
// that *weakness* is the only thing driving day allocation in these tests).
function domain(id: number, name: string, weight = 0.2): Domain {
  return { id, code: `D${id}`, name, weight, description: null };
}

const DOMAINS: Domain[] = [
  domain(1, "Risk Reduction"),
  domain(2, "Assessment & Diagnosis"),
  domain(3, "Critical Incident"),
  domain(4, "Therapeutic Intervention"),
  domain(5, "Healthcare Administration"),
];

function focusCounts(schedule: ScheduleDay[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const day of schedule) {
    if (day.focusDomainId == null) continue;
    counts.set(day.focusDomainId, (counts.get(day.focusDomainId) ?? 0) + 1);
  }
  return counts;
}

function dowUTC(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay();
}

function hasKind(day: ScheduleDay, kind: string): boolean {
  return day.items.some((it) => it.kind === kind);
}

describe("buildSchedule — weakness-first day allocation", () => {
  it("gives weaker domains more focus days while every domain keeps >= 1", () => {
    // Ascending mastery: domain 1 is weakest (0.0), domain 5 is mastered (1.0).
    const mastery = new Map<number, number>([
      [1, 0.0],
      [2, 0.25],
      [3, 0.5],
      [4, 0.75],
      [5, 1.0],
    ]);
    const schedule = buildSchedule("2026-01-01", "2026-02-15", DOMAINS, mastery);
    const counts = focusCounts(schedule);

    // Every domain is represented at least once.
    for (const d of DOMAINS) {
      assert.ok(
        (counts.get(d.id) ?? 0) >= 1,
        `domain ${d.id} (${d.name}) should keep >= 1 focus day, got ${counts.get(d.id) ?? 0}`,
      );
    }

    // Focus days decrease monotonically as mastery increases (weaker = more).
    const ordered = [1, 2, 3, 4, 5].map((id) => counts.get(id) ?? 0);
    for (let i = 1; i < ordered.length; i++) {
      assert.ok(
        ordered[i - 1] >= ordered[i],
        `weaker domain should get >= focus days than a stronger one: ${ordered.join(",")}`,
      );
    }

    // The weakest must strictly outrank the fully-mastered one.
    assert.ok(
      ordered[0] > ordered[4],
      `weakest domain (${ordered[0]}) should get strictly more days than the mastered one (${ordered[4]})`,
    );
  });

  it("guarantees every domain at least one day even in a compressed window", () => {
    // Exactly as many days as domains: the min-fill must give each one a day.
    const schedule = buildSchedule("2026-01-01", "2026-01-05", DOMAINS);
    assert.equal(schedule.length, 5);
    const counts = focusCounts(schedule);
    for (const d of DOMAINS) {
      assert.equal(
        counts.get(d.id) ?? 0,
        1,
        `domain ${d.id} should get exactly one day in a 5-day / 5-domain window`,
      );
    }
  });

  it("falls back to raw exam weight when there is no mastery data", () => {
    // No mastery map => every gap is 1, so priority collapses to weight. With a
    // heavier domain it should earn more focus days than the lighter ones.
    const weighted: Domain[] = [
      domain(1, "Risk Reduction", 0.1),
      domain(2, "Assessment & Diagnosis", 0.5),
      domain(3, "Critical Incident", 0.1),
      domain(4, "Therapeutic Intervention", 0.2),
      domain(5, "Healthcare Administration", 0.1),
    ];
    const schedule = buildSchedule("2026-01-01", "2026-02-15", weighted);
    const counts = focusCounts(schedule);
    const heaviest = counts.get(2) ?? 0;
    for (const id of [1, 3, 4, 5]) {
      assert.ok(
        heaviest >= (counts.get(id) ?? 0),
        `heaviest domain should earn >= focus days than domain ${id}`,
      );
    }
    assert.ok(heaviest > (counts.get(1) ?? 0), "heaviest should beat a light one");
  });
});

describe("buildSchedule — simulated exam placement", () => {
  // A multi-week window so there are several Saturdays before the final week
  // plus a full final week with its two extra sims.
  const schedule = buildSchedule("2026-01-01", "2026-02-15", DOMAINS);

  it("places a 175-question mock on every Saturday (not exam day) and the two final-week sims, nowhere else", () => {
    const lastIdx = schedule.length - 1;
    let weeklyMockCount = 0;
    let finalWeekMockCount = 0;

    for (const day of schedule) {
      const isExamDay = day.dayIndex === lastIdx;
      const inFinalWeek = !isExamDay && day.daysToExam <= 6;
      const isWeeklyMockDay = dowUTC(day.date) === 6 && !isExamDay && !inFinalWeek;
      const isFinalWeekMockDay =
        inFinalWeek && (day.daysToExam === 5 || day.daysToExam === 3);
      const shouldHaveMock = isWeeklyMockDay || isFinalWeekMockDay;

      assert.equal(
        hasKind(day, "mock_exam"),
        shouldHaveMock,
        `mock placement wrong on ${day.date} (daysToExam=${day.daysToExam}, dow=${dowUTC(day.date)})`,
      );

      if (hasKind(day, "mock_exam")) {
        if (isWeeklyMockDay) weeklyMockCount++;
        if (isFinalWeekMockDay) finalWeekMockCount++;
        const mock = day.items.find((it) => it.kind === "mock_exam")!;
        assert.match(mock.title, /175-question/);
        assert.equal(mock.estMinutes, 240, "the mock is a full 4-hour sitting");
      }
    }

    // Exactly two extra sims in the final week (days 5 and 3 out).
    assert.equal(finalWeekMockCount, 2, "final week has exactly two extra sims");
    // And at least one ordinary Saturday mock before the final week.
    assert.ok(weeklyMockCount >= 1, "at least one weekly Saturday mock");
  });

  it("never schedules a mock on the exam day itself", () => {
    const examDay = schedule[schedule.length - 1];
    assert.equal(examDay.isExamDay, true);
    assert.equal(hasKind(examDay, "mock_exam"), false);
  });

  it("gives each mock a unique per-date completion key", () => {
    const keys: string[] = [];
    for (const day of schedule) {
      for (const it of day.items) {
        if (it.kind === "mock_exam") {
          assert.equal(
            it.scheduledDate,
            day.date,
            "mock should carry its own day as scheduledDate",
          );
          keys.push(planItemKey(it));
        }
      }
    }
    assert.ok(keys.length >= 3, `expected several mocks, got ${keys.length}`);
    assert.equal(
      new Set(keys).size,
      keys.length,
      `mock keys must be unique per date, got duplicates in: ${keys.join(", ")}`,
    );
    // Keys are derived from the scheduled date, not a shared constant.
    for (const k of keys) {
      assert.match(k, /^mock_exam:\d{4}-\d{2}-\d{2}$/);
    }
  });
});

describe("buildSchedule — light days around the exam", () => {
  const schedule = buildSchedule("2026-01-01", "2026-02-15", DOMAINS);
  const examDay = schedule[schedule.length - 1];
  const dayBefore = schedule.find((d) => d.daysToExam === 1)!;

  it("makes the day before the exam a light, no-cramming day", () => {
    assert.equal(dayBefore.phase, "final_review");
    assert.match(dayBefore.title, /no cramming/i);
    // No heavy work: no full quiz and no simulated exam the day before.
    assert.equal(hasKind(dayBefore, "mock_exam"), false);
    assert.equal(hasKind(dayBefore, "quiz"), false);
    // It still includes an explicit rest item.
    assert.equal(hasKind(dayBefore, "rest"), true);
  });

  it("makes exam day light review only with no heavy or recurring items", () => {
    assert.equal(examDay.isExamDay, true);
    assert.match(examDay.title, /Exam Day/i);
    assert.equal(hasKind(examDay, "mock_exam"), false);
    assert.equal(hasKind(examDay, "quiz"), false);
    // Exam day deliberately skips the otherwise-daily game and study group.
    assert.equal(hasKind(examDay, "game"), false);
    assert.equal(hasKind(examDay, "study_group"), false);
    // Just a light review and a rest reminder.
    assert.equal(hasKind(examDay, "review"), true);
    assert.equal(hasKind(examDay, "rest"), true);
  });
});
