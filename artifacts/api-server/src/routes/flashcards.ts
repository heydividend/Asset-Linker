import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { db, flashcards, notes, topics, domains } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { chatJson, truncate } from "../lib/openaiHelpers";
import { getOrCreateSessionId } from "../lib/sessionId";
import { markPlanItemComplete, todayStr } from "../lib/planCompletions";

const router: IRouter = Router();

router.get("/notebooks/:id/flashcards", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(flashcards)
    .where(eq(flashcards.notebookId, id))
    .orderBy(desc(flashcards.createdAt));
  res.json(rows);
});

router.post("/notebooks/:id/flashcards", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { front, back, topicId } = req.body ?? {};
  if (!front || !back) {
    res.status(400).json({ error: "front and back required" });
    return;
  }
  const [card] = await db
    .insert(flashcards)
    .values({ notebookId: id, front, back, topicId: topicId ?? null })
    .returning();
  res.status(201).json(card);
});

router.post("/notebooks/:id/flashcards/generate", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { count = 10, focus, topicId: lockedTopicId } = req.body ?? {};
  const sourceNotes = await db.select().from(notes).where(eq(notes.notebookId, id));
  if (sourceNotes.length === 0) {
    res.status(400).json({ error: "Add notes to this notebook first." });
    return;
  }
  const sourceText = truncate(sourceNotes.map((n) => `## ${n.title}\n${n.content}`).join("\n\n"));

  // Load topics so we can ask the model to tag each card with one. Including
  // the domain name gives the classifier helpful scoping context.
  const topicRows = await db
    .select({ id: topics.id, name: topics.name, domain: domains.name })
    .from(topics)
    .leftJoin(domains, eq(topics.domainId, domains.id))
    .orderBy(topics.id);
  const topicById = new Map(topicRows.map((t) => [t.id, t]));
  let lockedId: number | null = null;
  if (lockedTopicId != null) {
    const n = Number(lockedTopicId);
    if (!Number.isInteger(n) || !topicById.has(n)) {
      res.status(400).json({ error: "Unknown topicId" });
      return;
    }
    lockedId = n;
  }

  const topicCatalog = topicRows
    .map((t) => `- id=${t.id} | ${t.domain ? `[${t.domain}] ` : ""}${t.name}`)
    .join("\n");

  let result: { cards: { front: string; back: string; topicId?: number | null }[] };
  try {
    const topicInstruction = lockedId
      ? `All cards MUST use topicId ${lockedId}.`
      : `For each card, choose the single best matching topicId from the TOPICS list. If nothing fits, use null.`;
    result = await chatJson<{ cards: { front: string; back: string; topicId?: number | null }[] }>(
      `Generate ${count} flashcards from the following Athletic Training study material${focus ? ` focused on: ${focus}` : ""}. Each flashcard should test a clinically relevant concept. ${topicInstruction} Return JSON: {"cards":[{"front":"question","back":"answer","topicId":<integer-or-null>}]}.\n\nTOPICS:\n${topicCatalog}\n\nMATERIAL:\n${sourceText}`,
    );
  } catch (err) {
    req.log.error({ err }, "flashcard generation failed");
    res.status(502).json({ error: "AI generation failed" });
    return;
  }

  const rows = (result.cards ?? [])
    .filter((c) => c.front && c.back)
    .slice(0, count)
    .map((c) => {
      let topicId: number | null = null;
      if (lockedId != null) {
        topicId = lockedId;
      } else if (c.topicId != null) {
        const n = Number(c.topicId);
        if (Number.isInteger(n) && topicById.has(n)) topicId = n;
      }
      return { notebookId: id, front: c.front, back: c.back, topicId };
    });
  if (rows.length === 0) {
    res.status(201).json([]);
    return;
  }
  const inserted = await db.insert(flashcards).values(rows).returning();
  res.status(201).json(inserted);
});

router.patch("/flashcards/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { front, back, topicId } = req.body ?? {};
  const [card] = await db
    .update(flashcards)
    .set({
      ...(front != null ? { front } : {}),
      ...(back != null ? { back } : {}),
      ...(topicId != null ? { topicId } : {}),
    })
    .where(eq(flashcards.id, id))
    .returning();
  if (!card) {
    res.status(404).json({ error: "Flashcard not found" });
    return;
  }
  res.json(card);
});

router.delete("/flashcards/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(flashcards).where(eq(flashcards.id, id));
  res.sendStatus(204);
});

router.post("/flashcards/:id/review", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const quality = Number(req.body?.quality);
  if (!Number.isInteger(quality) || quality < 0 || quality > 5) {
    res.status(400).json({ error: "quality must be 0-5" });
    return;
  }
  const [card] = await db.select().from(flashcards).where(eq(flashcards.id, id));
  if (!card) {
    res.status(404).json({ error: "Flashcard not found" });
    return;
  }
  // SM-2
  let { easeFactor, intervalDays, repetitions } = card;
  if (quality < 3) {
    repetitions = 0;
    intervalDays = 1;
  } else {
    repetitions = repetitions + 1;
    if (repetitions === 1) intervalDays = 1;
    else if (repetitions === 2) intervalDays = 6;
    else intervalDays = Math.round(intervalDays * easeFactor);
    easeFactor = Math.max(
      1.3,
      easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
    );
  }
  const dueAt = new Date(Date.now() + intervalDays * 86400 * 1000);
  const [updated] = await db
    .update(flashcards)
    .set({ easeFactor, intervalDays, repetitions, dueAt, lastReviewedAt: new Date() })
    .where(eq(flashcards.id, id))
    .returning();

  // Reviewing a flashcard satisfies today's daily flashcards plan item.
  // Single review is enough to count toward the mandatory mix — the user
  // has visibly engaged with spaced repetition.
  const sessionId = getOrCreateSessionId(req, res);
  await markPlanItemComplete(sessionId, todayStr(), "flashcards:due");

  res.json(updated);
});

router.post("/flashcards/:id/grade", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const answer = String(req.body?.answer ?? "").trim();
  if (!answer) {
    res.status(400).json({ error: "answer required" });
    return;
  }
  const [card] = await db.select().from(flashcards).where(eq(flashcards.id, id));
  if (!card) {
    res.status(404).json({ error: "Flashcard not found" });
    return;
  }

  // Ask the AI tutor to grade the typed answer against the official back of
  // the card. Score 0-100, verdict bucket, short tutor-style feedback, and a
  // suggested SM-2 quality so the UI can pre-select Again/Hard/Good/Easy.
  let graded: {
    verdict?: string;
    score?: number;
    feedback?: string;
    suggestedQuality?: number;
  };
  try {
    graded = await chatJson<typeof graded>(
      `Grade the student's typed answer to a BOC Athletic Training flashcard.
Compare meaning, not exact wording. A correct answer captures the key clinical concept(s) even if phrased differently.

QUESTION (front): ${card.front}
OFFICIAL ANSWER (back): ${card.back}
STUDENT ANSWER: ${answer}

Return JSON:
{
  "verdict": "correct" | "partial" | "wrong",
  "score": integer 0-100,
  "feedback": "1-3 sentences of supportive tutor feedback. Call out what they got right, what they missed, and the single most important fact to remember. Use markdown bold for key terms.",
  "suggestedQuality": integer 1-5 (1=Again, 3=Hard, 4=Good, 5=Easy)
}`,
    );
  } catch (err) {
    req.log.error({ err }, "flashcard grading failed");
    res.status(502).json({ error: "AI grading failed" });
    return;
  }

  const verdict = ["correct", "partial", "wrong"].includes(String(graded.verdict))
    ? (graded.verdict as "correct" | "partial" | "wrong")
    : "partial";
  const score = Math.max(0, Math.min(100, Math.round(Number(graded.score) || 0)));
  const sq = Number(graded.suggestedQuality);
  const suggestedQuality = [1, 3, 4, 5].includes(sq)
    ? sq
    : verdict === "correct"
    ? 4
    : verdict === "partial"
    ? 3
    : 1;
  res.json({
    verdict,
    score,
    feedback: String(graded.feedback ?? ""),
    suggestedQuality,
    back: card.back,
  });
});

router.get("/flashcards", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(flashcards)
    .orderBy(desc(flashcards.createdAt));
  res.json(rows);
});

router.get("/flashcards/due", async (req, res): Promise<void> => {
  const raw = typeof req.query.topicIds === "string" ? req.query.topicIds : "";
  const topicIds = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);

  const where = topicIds.length > 0
    ? and(lte(flashcards.dueAt, new Date()), inArray(flashcards.topicId, topicIds))
    : lte(flashcards.dueAt, new Date());

  const rows = await db
    .select()
    .from(flashcards)
    .where(where)
    .orderBy(asc(flashcards.dueAt))
    .limit(100);
  res.json(rows);
});

export default router;
