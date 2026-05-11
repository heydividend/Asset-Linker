import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";
import { db, flashcards, notes } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { chatJson, truncate } from "../lib/openaiHelpers";

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
  const { count = 10, focus } = req.body ?? {};
  const sourceNotes = await db.select().from(notes).where(eq(notes.notebookId, id));
  if (sourceNotes.length === 0) {
    res.status(400).json({ error: "Add notes to this notebook first." });
    return;
  }
  const sourceText = truncate(sourceNotes.map((n) => `## ${n.title}\n${n.content}`).join("\n\n"));

  let result: { cards: { front: string; back: string }[] };
  try {
    result = await chatJson<{ cards: { front: string; back: string }[] }>(
      `Generate ${count} flashcards from the following Athletic Training study material${focus ? ` focused on: ${focus}` : ""}. Each flashcard should test a clinically relevant concept. Return JSON: {"cards":[{"front":"question","back":"answer"}]}.\n\nMATERIAL:\n${sourceText}`,
    );
  } catch (err) {
    req.log.error({ err }, "flashcard generation failed");
    res.status(502).json({ error: "AI generation failed" });
    return;
  }

  const inserted = await db
    .insert(flashcards)
    .values(
      (result.cards ?? [])
        .filter((c) => c.front && c.back)
        .slice(0, count)
        .map((c) => ({ notebookId: id, front: c.front, back: c.back })),
    )
    .returning();
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
  res.json(updated);
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
