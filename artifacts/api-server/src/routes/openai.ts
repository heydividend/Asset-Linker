import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, conversations, messages, notes, notebooks } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { parseId } from "../lib/parseId";
import multer from "multer";
import { PDFParse } from "pdf-parse";

async function extractPdfText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy().catch(() => {});
  }
}

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

async function extractText(file: Express.Multer.File): Promise<string> {
  const mime = file.mimetype || "";
  const name = file.originalname || "file";
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) {
    const parsed = { text: await extractPdfText(file.buffer) };
    return parsed.text || "";
  }
  if (
    mime.startsWith("text/") ||
    /\.(txt|md|csv|json|html|xml|rtf)$/i.test(name)
  ) {
    return file.buffer.toString("utf8");
  }
  if (mime.startsWith("image/")) {
    return `[Image attached: ${name}. The student wants you to discuss this image visually if relevant; ask them to describe what they see if you cannot interpret it directly.]`;
  }
  return file.buffer.toString("utf8").slice(0, 200_000);
}

async function ensureLibraryNotebook(): Promise<number> {
  const existing = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.title, "Tutor Library"))
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(notebooks)
    .values({
      title: "Tutor Library",
      description: "Content you uploaded through the AI Tutor chat.",
    })
    .returning();
  return created.id;
}

const SYSTEM = `You are an expert Athletic Training tutor helping a student prepare for the Board of Certification (BOC) exam.
Be warm, precise, and clinically accurate. Use the BOC's 5 domains as your frame:
1) Risk Reduction, Wellness & Health Literacy
2) Assessment, Evaluation & Diagnosis
3) Critical Incident Management
4) Therapeutic Intervention
5) Healthcare Administration & Professional Responsibility
When the user asks about a flashcard, quiz question, note, or weak topic, anchor your answer in the supplied context. Use Markdown. Be concise but thorough; favor mechanism, indication, contraindication, and red-flag callouts.`;

router.get("/openai/conversations", async (_req, res): Promise<void> => {
  const rows = await db.select().from(conversations).orderBy(desc(conversations.createdAt));
  res.json(rows);
});

router.post("/openai/conversations", async (req, res): Promise<void> => {
  const { title, notebookId } = req.body ?? {};
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title required" });
    return;
  }
  const [c] = await db
    .insert(conversations)
    .values({ title: title.slice(0, 200), notebookId: notebookId ?? null })
    .returning();
  res.status(201).json(c);
});

router.get("/openai/conversations/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [c] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!c) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(c);
});

router.delete("/openai/conversations/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(conversations).where(eq(conversations.id, id));
  res.sendStatus(204);
});

router.get("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  res.json(rows);
});

router.post(
  "/openai/conversations/:id/upload",
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
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }
    let text = "";
    try {
      text = await extractText(file);
    } catch (err) {
      req.log.error({ err }, "upload extract failed");
      res.status(400).json({ error: "Could not extract text from file" });
      return;
    }
    const trimmed = (text || "").slice(0, 100_000).trim();
    if (!trimmed) {
      res.status(400).json({ error: "No readable text in file" });
      return;
    }
    const note = req.body?.note ? String(req.body.note).slice(0, 1000) : "";
    const saveToLibrary = req.body?.saveToLibrary === "true" || req.body?.saveToLibrary === true;

    const summary = `[Attached file: ${file.originalname} (${(file.size / 1024).toFixed(0)} KB)]${note ? `\n\nStudent's note: ${note}` : ""}\n\n--- File contents ---\n${trimmed}`;

    await db.insert(messages).values({
      conversationId: id,
      role: "user",
      content: summary,
    });

    let savedNoteId: number | null = null;
    if (saveToLibrary) {
      const targetNotebookId = conv.notebookId ?? (await ensureLibraryNotebook());
      const [n] = await db
        .insert(notes)
        .values({
          notebookId: targetNotebookId,
          title: file.originalname,
          content: trimmed,
          sourceKind: file.mimetype === "application/pdf" ? "pdf" : "paste",
        })
        .returning();
      savedNoteId = n.id;
    }

    res.status(201).json({
      ok: true,
      filename: file.originalname,
      size: file.size,
      extractedChars: trimmed.length,
      savedNoteId,
    });
  },
);

router.post("/openai/conversations/:id/messages", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const content = req.body?.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    res.status(400).json({ error: "content required" });
    return;
  }

  const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  await db.insert(messages).values({ conversationId: id, role: "user", content });

  const history = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let fullText = "";
  try {
    const stream = await openai.chat.completions.create({
      model: "gpt-5-mini",
      stream: true,
      messages: [
        { role: "system", content: SYSTEM },
        ...history.map((m) => ({
          role: m.role as "user" | "assistant" | "system",
          content: m.content,
        })),
      ],
    });
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      if (delta) {
        fullText += delta;
        res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
      }
    }
  } catch (err) {
    req.log.error({ err }, "openai stream failed");
    res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
  }

  if (fullText) {
    await db.insert(messages).values({ conversationId: id, role: "assistant", content: fullText });
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
  res.end();
});

export default router;
