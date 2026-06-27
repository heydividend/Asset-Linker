import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, domains, tasks, taskMastery, questions } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { getOrCreateSessionId } from "../lib/sessionId";
import { PA8_DOMAIN_SUMMARIES } from "../lib/pa8Reference";
import { PA8_TASK_RATINGS } from "../lib/pa8Blueprint";

const router: IRouter = Router();

// GET /blueprint — the full official BOC PA8 content outline with the student's
// own progress baked in: every domain (with its official description + exam
// weight) and its task statements, each carrying the student's self-rated
// confidence, objective mastery, attempt counts, and how many tagged questions
// exist to drill it. This is the single payload behind the Blueprint page.
router.get("/blueprint", async (req, res): Promise<void> => {
  const userId = getOrCreateSessionId(req, res);
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const tRows = await db.select().from(tasks).orderBy(tasks.sortOrder);
  const mRows = await db.select().from(taskMastery).where(eq(taskMastery.userId, userId));
  const masteryByTask = new Map(mRows.map((m) => [m.taskId, m]));

  // Count enabled questions tagged to each task so the UI can show what is
  // actually drillable per task.
  const counts = (await db.execute(sql`
    SELECT task_id, count(*)::int AS n
    FROM questions
    WHERE task_id IS NOT NULL AND enabled = true
    GROUP BY task_id
  `)) as unknown as { rows: Array<{ task_id: number; n: number }> };
  const countByTask = new Map(counts.rows.map((r) => [r.task_id, r.n]));

  const tasksByDomain = new Map<number, typeof tRows>();
  for (const t of tRows) {
    const arr = tasksByDomain.get(t.domainId) ?? [];
    arr.push(t);
    tasksByDomain.set(t.domainId, arr);
  }

  const result = dRows.map((d) => ({
    id: d.id,
    code: d.code,
    name: d.name,
    weight: d.weight,
    description: d.description ?? null,
    summary: PA8_DOMAIN_SUMMARIES[d.code] ?? null,
    tasks: (tasksByDomain.get(d.id) ?? []).map((t) => {
      const m = masteryByTask.get(t.id);
      const rating = PA8_TASK_RATINGS[t.code];
      return {
        id: t.id,
        code: t.code,
        statement: t.statement,
        confidence: t.confidence ?? null,
        sortOrder: t.sortOrder,
        mastery: m?.mastery ?? 0,
        attempts: m?.attempts ?? 0,
        correct: m?.correct ?? 0,
        questionCount: countByTask.get(t.id) ?? 0,
        importance: rating?.importance ?? null,
        frequency: rating?.frequency ?? null,
      };
    }),
  }));

  res.json({ domains: result });
});

// PATCH /tasks/:id — set (or clear) the student's self-rated confidence for a
// single task. 1 = shaky, 2 = okay, 3 = solid; null clears the rating.
router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const raw = req.body?.confidence;
  let confidence: number | null;
  if (raw === null) {
    confidence = null;
  } else if (typeof raw === "number" && [1, 2, 3].includes(raw)) {
    confidence = raw;
  } else {
    res.status(400).json({ error: "confidence must be 1, 2, 3, or null" });
    return;
  }
  const [updated] = await db
    .update(tasks)
    .set({ confidence, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.json({ id: updated.id, code: updated.code, confidence: updated.confidence ?? null });
});

export default router;
