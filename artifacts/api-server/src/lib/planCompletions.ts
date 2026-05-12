import { and, eq } from "drizzle-orm";
import { db, planCompletions } from "@workspace/db";

export { todayStrPT as todayStr } from "./today";

// Idempotent insert; safe to call repeatedly when the same activity finishes
// multiple times in one day. Returns true if a new row was created.
export async function markPlanItemComplete(
  sessionId: string,
  date: string,
  itemKey: string,
): Promise<boolean> {
  const inserted = await db
    .insert(planCompletions)
    .values({ sessionId, date, itemKey })
    .onConflictDoNothing({
      target: [planCompletions.sessionId, planCompletions.date, planCompletions.itemKey],
    })
    .returning({ id: planCompletions.id });
  return inserted.length > 0;
}

export async function listCompletedKeys(
  sessionId: string,
  date: string,
): Promise<string[]> {
  const rows = await db
    .select({ itemKey: planCompletions.itemKey })
    .from(planCompletions)
    .where(and(eq(planCompletions.sessionId, sessionId), eq(planCompletions.date, date)));
  return rows.map((r) => r.itemKey);
}
