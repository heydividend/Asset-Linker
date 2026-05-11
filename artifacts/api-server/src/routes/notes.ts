import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, notebooks, notes } from "@workspace/db";
import { parseId } from "../lib/parseId";
import multer from "multer";
import { extractPdfText } from "./openai";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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

type CreateNoteInput = {
  title: string;
  content: string;
  sourceKind?: string | null;
  sourceUrl?: string | null;
  topicId?: number | null;
};

async function createNoteForNotebook(notebookId: number, input: CreateNoteInput) {
  const [note] = await db
    .insert(notes)
    .values({
      notebookId,
      title: input.title,
      content: input.content,
      sourceKind: input.sourceKind ?? "text",
      sourceUrl: input.sourceUrl ?? null,
      topicId: input.topicId ?? null,
    })
    .returning();
  await db
    .update(notebooks)
    .set({ updatedAt: new Date() })
    .where(eq(notebooks.id, notebookId));
  return note;
}

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
  const note = await createNoteForNotebook(id, { title, content, sourceKind, sourceUrl, topicId });
  res.status(201).json(note);
});

router.post(
  "/notebooks/:id/import",
  upload.single("file"),
  async (req, res): Promise<void> => {
    const id = parseId(req);
    if (id == null) {
      res.status(400).json({ error: "invalid id" });
      return;
    }
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: "file required" });
      return;
    }
    const [nb] = await db.select().from(notebooks).where(eq(notebooks.id, id));
    if (!nb) {
      res.status(404).json({ error: "Notebook not found" });
      return;
    }
    const name = file.originalname || "file";
    const mime = file.mimetype || "";
    const isPdf = mime === "application/pdf" || name.toLowerCase().endsWith(".pdf");
    const isText =
      mime.startsWith("text/") || /\.(txt|md)$/i.test(name);
    if (!isPdf && !isText) {
      res.status(400).json({ error: "Only PDF, TXT, or MD files are supported" });
      return;
    }
    let text = "";
    try {
      text = isPdf
        ? await extractPdfText(file.buffer)
        : file.buffer.toString("utf8");
    } catch (err) {
      req.log.error({ err }, "import extract failed");
      res.status(400).json({ error: "Could not extract text from file" });
      return;
    }
    const trimmed = (text || "").slice(0, 200_000).trim();
    if (!trimmed) {
      res.status(400).json({ error: "No readable text in file" });
      return;
    }
    const note = await createNoteForNotebook(id, {
      title: name,
      content: trimmed,
      sourceKind: isPdf ? "pdf" : "paste",
    });
    res.status(201).json({
      note,
      filename: name,
      size: file.size,
      extractedChars: trimmed.length,
    });
  },
);

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
