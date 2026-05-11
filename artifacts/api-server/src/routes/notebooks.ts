import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  notebooks,
  notes,
  flashcards,
  studyGuides,
  audioOverviews,
} from "@workspace/db";
import { parseId } from "../lib/parseId";

const router: IRouter = Router();

async function notebookCounts(id: number) {
  const [n] = await db
    .select({ c: sql<number>`cast(count(*) as int)` })
    .from(notes)
    .where(eq(notes.notebookId, id));
  const [f] = await db
    .select({ c: sql<number>`cast(count(*) as int)` })
    .from(flashcards)
    .where(eq(flashcards.notebookId, id));
  return { noteCount: n?.c ?? 0, flashcardCount: f?.c ?? 0 };
}

router.get("/notebooks", async (_req, res): Promise<void> => {
  const rows = await db.select().from(notebooks).orderBy(desc(notebooks.updatedAt));
  const out = await Promise.all(
    rows.map(async (nb) => ({ ...nb, ...(await notebookCounts(nb.id)) })),
  );
  res.json(out);
});

router.post("/notebooks", async (req, res): Promise<void> => {
  const { title, description } = req.body ?? {};
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title required" });
    return;
  }
  const [nb] = await db
    .insert(notebooks)
    .values({ title, description: description ?? null })
    .returning();
  res.status(201).json({ ...nb, noteCount: 0, flashcardCount: 0 });
});

router.get("/notebooks/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [nb] = await db.select().from(notebooks).where(eq(notebooks.id, id));
  if (!nb) {
    res.status(404).json({ error: "Notebook not found" });
    return;
  }
  const [ns, fc, sg, ao] = await Promise.all([
    db.select().from(notes).where(eq(notes.notebookId, id)).orderBy(desc(notes.createdAt)),
    db.select().from(flashcards).where(eq(flashcards.notebookId, id)).orderBy(desc(flashcards.createdAt)),
    db.select().from(studyGuides).where(eq(studyGuides.notebookId, id)).orderBy(desc(studyGuides.createdAt)),
    db
      .select({
        id: audioOverviews.id,
        notebookId: audioOverviews.notebookId,
        title: audioOverviews.title,
        status: audioOverviews.status,
        voice: audioOverviews.voice,
        durationSec: audioOverviews.durationSec,
        transcript: audioOverviews.transcript,
        createdAt: audioOverviews.createdAt,
      })
      .from(audioOverviews)
      .where(eq(audioOverviews.notebookId, id))
      .orderBy(desc(audioOverviews.createdAt)),
  ]);
  res.json({ ...nb, notes: ns, flashcards: fc, studyGuides: sg, audioOverviews: ao });
});

router.patch("/notebooks/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { title, description } = req.body ?? {};
  const [nb] = await db
    .update(notebooks)
    .set({
      ...(title != null ? { title } : {}),
      ...(description != null ? { description } : {}),
      updatedAt: new Date(),
    })
    .where(eq(notebooks.id, id))
    .returning();
  if (!nb) {
    res.status(404).json({ error: "Notebook not found" });
    return;
  }
  res.json({ ...nb, ...(await notebookCounts(id)) });
});

router.delete("/notebooks/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(notebooks).where(eq(notebooks.id, id));
  res.sendStatus(204);
});

export default router;
