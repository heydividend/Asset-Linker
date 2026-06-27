import { and, eq } from "drizzle-orm";
import { db, domains, examSchedule } from "@workspace/db";
import { buildSchedule } from "./scheduleBuilder";
import { getDomainMasteryMap } from "./domainMastery";
import { planItemKey } from "./planItemKey";
import { listCompletedKeysThrough } from "./planCompletions";

const DEFAULT_START = "2026-06-26";
const DEFAULT_EXAM = "2026-07-25";
const DEFAULT_NAME = "July/August 2026 BOC Pass Plan";

// The previous auto-generated default window. A row still holding these exact
// dates is a stale, never-customized plan (its window is now in the past), so
// we migrate it forward to the active plan. Any other dates are treated as a
// user customization and left untouched.
const LEGACY_DEFAULT_WINDOWS = new Set(["2026-05-11|2026-06-06"]);

export async function getOrCreateSchedule(userId: string) {
  const [row] = await db
    .select()
    .from(examSchedule)
    .where(eq(examSchedule.userId, userId))
    .limit(1);
  if (row) {
    if (LEGACY_DEFAULT_WINDOWS.has(`${row.startDate}|${row.examDate}`)) {
      const [migrated] = await db
        .update(examSchedule)
        .set({
          startDate: DEFAULT_START,
          examDate: DEFAULT_EXAM,
          examName: DEFAULT_NAME,
          updatedAt: new Date(),
        })
        .where(eq(examSchedule.id, row.id))
        .returning();
      return migrated;
    }
    return row;
  }
  const [created] = await db
    .insert(examSchedule)
    .values({ userId, startDate: DEFAULT_START, examDate: DEFAULT_EXAM, examName: DEFAULT_NAME })
    .returning();
  return created;
}

// Returns the completion key for the mock-exam plan item scheduled on `date`,
// or null when that date isn't a simulated-exam day. The key is derived from
// the actual plan item (not hand-built) so it always matches the key used by
// /plan/today, keeping auto-completion in lockstep with carry-forward.
export async function mockPlanItemKeyForDay(userId: string, date: string): Promise<string | null> {
  const sched = await getOrCreateSchedule(userId);
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap(userId);
  const days = buildSchedule(sched.startDate, sched.examDate, dRows, masteryByDomainId);
  const day = days.find((d) => d.date === date);
  const mock = day?.items.find((it) => it.kind === "mock_exam");
  return mock ? planItemKey(mock) : null;
}

// Returns the completion key of the earliest simulated-exam plan item scheduled
// on a day strictly before `today` that this session has never completed (on its
// original day or any later day), or null when there is no outstanding past mock.
// Used so a make-up mock taken on a non-scheduled day can clear the oldest
// overdue simulated exam. Uses listCompletedKeysThrough so it never re-picks a
// mock already cleared (by auto-check or a manual "mark complete" tap).
export async function earliestUncompletedPastMockKey(
  sessionId: string,
  today: string,
): Promise<string | null> {
  const sched = await getOrCreateSchedule(sessionId);
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap(sessionId);
  const days = buildSchedule(sched.startDate, sched.examDate, dRows, masteryByDomainId);
  const everCompleted = new Set(await listCompletedKeysThrough(sessionId, today));
  // buildSchedule yields days in ascending date order, so the first match is
  // the earliest outstanding mock.
  for (const day of days) {
    if (day.date >= today) break;
    const mock = day.items.find((it) => it.kind === "mock_exam");
    if (!mock) continue;
    const key = planItemKey(mock);
    if (!everCompleted.has(key)) return key;
  }
  return null;
}
