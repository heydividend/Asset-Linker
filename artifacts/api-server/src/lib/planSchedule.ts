import { eq } from "drizzle-orm";
import { db, domains, examSchedule } from "@workspace/db";
import { buildSchedule } from "./scheduleBuilder";
import { getDomainMasteryMap } from "./domainMastery";
import { planItemKey } from "./planItemKey";

const DEFAULT_START = "2026-06-26";
const DEFAULT_EXAM = "2026-07-25";
const DEFAULT_NAME = "July/August 2026 BOC Pass Plan";

// The previous auto-generated default window. A row still holding these exact
// dates is a stale, never-customized plan (its window is now in the past), so
// we migrate it forward to the active plan. Any other dates are treated as a
// user customization and left untouched.
const LEGACY_DEFAULT_WINDOWS = new Set(["2026-05-11|2026-06-06"]);

export async function getOrCreateSchedule() {
  const [row] = await db.select().from(examSchedule).limit(1);
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
    .values({ startDate: DEFAULT_START, examDate: DEFAULT_EXAM, examName: DEFAULT_NAME })
    .returning();
  return created;
}

// Returns the completion key for the mock-exam plan item scheduled on `date`,
// or null when that date isn't a simulated-exam day. The key is derived from
// the actual plan item (not hand-built) so it always matches the key used by
// /plan/today, keeping auto-completion in lockstep with carry-forward.
export async function mockPlanItemKeyForDay(date: string): Promise<string | null> {
  const sched = await getOrCreateSchedule();
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap();
  const days = buildSchedule(sched.startDate, sched.examDate, dRows, masteryByDomainId);
  const day = days.find((d) => d.date === date);
  const mock = day?.items.find((it) => it.kind === "mock_exam");
  return mock ? planItemKey(mock) : null;
}
