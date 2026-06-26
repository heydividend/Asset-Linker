import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db, questions } from "@workspace/db";
import { classifyTaskId } from "../lib/classifyTask";

// One-off (re-runnable) backfill: AI-classify every enabled question that has a
// domain but no task yet, tagging it to the best-fitting PA8 task within its
// domain. Safe to run repeatedly — it only touches untagged questions.
//
// Usage: pnpm --filter @workspace/api-server exec tsx src/scripts/backfillTaskTags.ts
async function main() {
  const rows = await db
    .select({
      id: questions.id,
      stem: questions.stem,
      choices: questions.choices,
      rationale: questions.rationale,
      domainId: questions.domainId,
    })
    .from(questions)
    .where(and(isNull(questions.taskId), isNotNull(questions.domainId), eq(questions.enabled, true)));

  console.log(`Backfilling ${rows.length} untagged question(s)…`);
  let tagged = 0;
  let failed = 0;
  const CONCURRENCY = 5;

  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (q) => {
        const taskId = await classifyTaskId(
          { stem: q.stem, choices: q.choices, rationale: q.rationale },
          q.domainId,
        );
        if (taskId) {
          // Guard on taskId IS NULL so a concurrent writer (live generation
          // tagging or another backfill worker) that already tagged this
          // question is never overwritten.
          await db
            .update(questions)
            .set({ taskId })
            .where(and(eq(questions.id, q.id), isNull(questions.taskId)));
          tagged++;
        } else {
          failed++;
        }
      }),
    );
    console.log(`  …${Math.min(i + CONCURRENCY, rows.length)}/${rows.length} processed (${tagged} tagged)`);
  }

  console.log(`Done. Tagged ${tagged}, left untagged ${failed}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
