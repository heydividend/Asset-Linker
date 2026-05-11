import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, notebooks, notes } from "@workspace/db";
import { parseId } from "../lib/parseId";

const router: IRouter = Router();

router.get("/notebooks/:id/notes", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.notebookId, id))
    .orderBy(desc(notes.createdAt));
  res.json(rows);
});

router.post("/notebooks/:id/notes", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { title, content, sourceKind, sourceUrl, topicId } = req.body ?? {};
  if (!title || typeof content !== "string") {
    res.status(400).json({ error: "title and content required" });
    return;
  }
  const [note] = await db
    .insert(notes)
    .values({
      notebookId: id,
      title,
      content,
      sourceKind: sourceKind ?? "text",
      sourceUrl: sourceUrl ?? null,
      topicId: topicId ?? null,
    })
    .returning();
  await db.update(notebooks).set({ updatedAt: new Date() }).where(eq(notebooks.id, id));
  res.status(201).json(note);
});

router.get("/notes/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [note] = await db.select().from(notes).where(eq(notes.id, id));
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.json(note);
});

router.patch("/notes/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { title, content, topicId } = req.body ?? {};
  const [note] = await db
    .update(notes)
    .set({
      ...(title != null ? { title } : {}),
      ...(content != null ? { content } : {}),
      ...(topicId != null ? { topicId } : {}),
    })
    .where(eq(notes.id, id))
    .returning();
  if (!note) {
    res.status(404).json({ error: "Note not found" });
    return;
  }
  res.json(note);
});

router.delete("/notes/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(notes).where(eq(notes.id, id));
  res.sendStatus(204);
});

export default router;
