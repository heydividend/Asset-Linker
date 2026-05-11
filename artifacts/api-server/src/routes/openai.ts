import { Router, type IRouter } from "express";
import { asc, desc, eq } from "drizzle-orm";
import { db, conversations, messages, notes, notebooks } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { parseId } from "../lib/parseId";
import multer from "multer";
import { PDFParse } from "pdf-parse";
import { COACHING_STRATEGIES } from "../lib/coachingStrategies";
import { BOC_GLOSSARY } from "../lib/bocGlossary";

export async function extractPdfText(buf: Buffer): Promise<string> {
  const parser = new PDFParse({ data: new Uint8Array(buf) });
  try {
    const result = await parser.getText();
    return result.text ?? "";
  } finally {
    await parser.destroy().catch(() => {});
  }
}

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

async function extractTextFromImage(file: Express.Multer.File): Promise<string> {
  // Use OpenAI vision to read the image (study guide pages, screenshots, diagrams).
  const b64 = file.buffer.toString("base64");
  const mime = file.mimetype || "image/png";
  const dataUrl = `data:${mime};base64,${b64}`;
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You extract study material from images for an Athletic Training BOC exam student. Output the readable text faithfully (preserve headings, bullet lists, numbered lists). If the image is a diagram or photo with no text, write a concise clinical description of what is shown. Do not add commentary. Do not reformat tables into prose if avoidable.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: `Extract all readable study content from this image (file: ${file.originalname}).` },
          { type: "image_url", image_url: { url: dataUrl } },
        ] as never,
      },
    ],
  });
  return completion.choices[0]?.message?.content?.trim() ?? "";
}

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
    try {
      const visionText = await extractTextFromImage(file);
      if (visionText) return visionText;
    } catch {
      // fall through to placeholder
    }
    return `[Image attached: ${name}. Could not auto-extract text — please describe what you see and I'll help.]`;
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

const SYSTEM_BASE = `You are an expert Athletic Training tutor helping a student prepare for the Board of Certification (BOC) exam.
Be warm, precise, and clinically accurate. Use the BOC's 5 domains as your frame:
1) Risk Reduction, Wellness & Health Literacy
2) Assessment, Evaluation & Diagnosis
3) Critical Incident Management
4) Therapeutic Intervention
5) Healthcare Administration & Professional Responsibility
When the user asks about a flashcard, quiz question, note, or weak topic, anchor your answer in the supplied context. Be concise but thorough; favor mechanism, indication, contraindication, and red-flag callouts.

FORMATTING RULES — every reply must be well-structured Markdown:
- Open with a one-sentence direct answer (no preamble like "Great question").
- Use "## " for major sections and "### " for sub-sections when the answer is more than ~4 sentences.
- Use bullet lists ("- ") for parallel items (signs, steps, criteria); never write a wall of prose for list-shaped content.
- Use numbered lists ("1.") only for ordered procedures (e.g., assessment sequence, return-to-play stages).
- **Bold** the key term being defined and any red-flag warning.
- Use a Markdown table when comparing 3+ entities along 2+ attributes.
- Wrap any specific clinical numeric value (degrees of motion, % loads, time windows) in backticks for emphasis.
- End complex answers with a short "**Key takeaway:**" or "**Clinical pearl:**" line.
- Never wrap the whole reply in a code fence. Never repeat the user's question back.

${COACHING_STRATEGIES}

REFERENCE GLOSSARY — Use these definitions as the authoritative vocabulary
for every answer. Prefer the wording below when defining or correcting terms.
If a student uses a term, silently align your reply with this glossary's
definition (do not quote the whole glossary; just use the right meaning).
Do not invent definitions that conflict with these.

<<<BOC_GLOSSARY_START>>>
${BOC_GLOSSARY}
<<<BOC_GLOSSARY_END>>>
`;

const REFERENCE_LIBRARY_NOTEBOOK_ID = 4;
let referenceCache: { text: string; loadedAt: number } | null = null;
const REFERENCE_TTL_MS = 5 * 60 * 1000;

// Per-note cap so the full Reference Library fits in Claude's 200K context.
// ~22K chars/note × ~32 notes ≈ 700K chars (~175K tokens) leaving headroom
// for the base prompt, glossary, conversation history, and the response.
const MAX_NOTE_CHARS = 22000;

function capNoteContent(content: string): string {
  if (content.length <= MAX_NOTE_CHARS) return content;
  return content.slice(0, MAX_NOTE_CHARS) + "\n\n[... section truncated for length — ask the tutor for more detail on a specific subtopic if needed ...]";
}

async function loadReferenceLibrary(): Promise<string> {
  const now = Date.now();
  if (referenceCache && now - referenceCache.loadedAt < REFERENCE_TTL_MS) {
    return referenceCache.text;
  }
  const rows = await db
    .select()
    .from(notes)
    .where(eq(notes.notebookId, REFERENCE_LIBRARY_NOTEBOOK_ID))
    .orderBy(asc(notes.id));
  // Skip the BOC Glossary (already in SYSTEM_BASE) and assemble the rest.
  const sections = rows
    .filter((r) => !/glossary/i.test(r.title))
    .map((r) => `## ${r.title}\n\n${capNoteContent(r.content)}`)
    .join("\n\n---\n\n");
  const text = sections
    ? `\nADDITIONAL REFERENCE LIBRARY — User-curated study materials. Treat these as authoritative ground truth alongside the glossary. Cite them by section title when relevant.\n\n<<<REFERENCE_LIBRARY_START>>>\n${sections}\n<<<REFERENCE_LIBRARY_END>>>\n`
    : "";
  referenceCache = { text, loadedAt: now };
  return text;
}

async function buildSystemPrompt(): Promise<string> {
  const refLib = await loadReferenceLibrary();
  return SYSTEM_BASE + refLib;
}

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

  // Build Claude-compatible message history: only user/assistant roles,
  // collapse consecutive same-role turns by joining with a blank line.
  const claudeMessages: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of history) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const last = claudeMessages[claudeMessages.length - 1];
    if (last && last.role === m.role) {
      last.content += "\n\n" + m.content;
    } else {
      claudeMessages.push({ role: m.role, content: m.content });
    }
  }
  // Claude requires the first message to be a user turn.
  while (claudeMessages.length && claudeMessages[0].role !== "user") {
    claudeMessages.shift();
  }

  let fullText = "";
  try {
    const systemPrompt = await buildSystemPrompt();
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: systemPrompt,
      messages: claudeMessages,
    });
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        const delta = event.delta.text;
        if (delta) {
          fullText += delta;
          res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
        }
      }
    }
  } catch (err) {
    req.log.error({ err }, "anthropic stream failed");
    res.write(`data: ${JSON.stringify({ error: "AI request failed" })}\n\n`);
  }

  // Persist the assistant message and release the UI BEFORE computing
  // follow-up suggestions. The followups call previously gated `done`
  // and added 1–2s of perceived latency after the visible answer was
  // already rendered. We now save with followups=null, ship `done`, then
  // compute and emit followups as a later chunk.
  let savedMessageId: number | null = null;
  if (fullText) {
    const [saved] = await db
      .insert(messages)
      .values({
        conversationId: id,
        role: "assistant",
        content: fullText,
        followups: null,
      })
      .returning({ id: messages.id });
    savedMessageId = saved?.id ?? null;
  }
  res.write(`data: ${JSON.stringify({ done: true })}\n\n`);

  if (fullText) {
    let followups: string[] = [];
    try {
      const fu = await anthropic.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 256,
        system:
          'You generate exactly 3 short follow-up questions a BOC Athletic Training student would naturally ask next, given the tutor turn just shown. Each question must be self-contained, under 90 characters, and end with "?". Respond with ONLY a JSON object of the form {"followups": ["...", "...", "..."]} — no prose, no code fences.',
        messages: [
          { role: "user", content: `Student asked: ${content.slice(0, 800)}\n\nTutor replied:\n${fullText.slice(0, 4000)}` },
        ],
      });
      const block = fu.content.find((b) => b.type === "text");
      const raw = block && block.type === "text" ? block.text : "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : "{}");
      if (Array.isArray(parsed.followups)) {
        followups = parsed.followups
          .filter((s: unknown): s is string => typeof s === "string")
          .map((s: string) => s.trim())
          .filter((s: string) => s.length > 0)
          .slice(0, 3);
      }
    } catch (err) {
      req.log.warn({ err }, "followups generation failed");
    }
    if (followups.length > 0) {
      if (savedMessageId != null) {
        await db
          .update(messages)
          .set({ followups })
          .where(eq(messages.id, savedMessageId));
      }
      res.write(`data: ${JSON.stringify({ followups })}\n\n`);
    }
  }
  res.end();
});

export default router;
