import { Router, type IRouter } from "express";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db, notebooks, studyGuides, notes } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { chatText, truncate } from "../lib/openaiHelpers";

const router: IRouter = Router();

const VALID_FORMATS = ["outline", "summary", "qa", "mindmap"] as const;

router.get("/study-guides", async (req, res): Promise<void> => {
  const filters: SQL[] = [];
  const notebookIdRaw = req.query.notebookId;
  if (typeof notebookIdRaw === "string" && notebookIdRaw.length > 0) {
    const n = Number(notebookIdRaw);
    if (Number.isFinite(n)) filters.push(eq(studyGuides.notebookId, n));
  }
  const formatRaw = req.query.format;
  if (typeof formatRaw === "string" && (VALID_FORMATS as readonly string[]).includes(formatRaw)) {
    filters.push(eq(studyGuides.format, formatRaw));
  }
  const baseQuery = db
    .select({
      id: studyGuides.id,
      notebookId: studyGuides.notebookId,
      notebookTitle: notebooks.title,
      title: studyGuides.title,
      format: studyGuides.format,
      content: studyGuides.content,
      createdAt: studyGuides.createdAt,
    })
    .from(studyGuides)
    .innerJoin(notebooks, eq(notebooks.id, studyGuides.notebookId));
  const rows = await (filters.length > 0
    ? baseQuery.where(and(...filters)).orderBy(desc(studyGuides.createdAt))
    : baseQuery.orderBy(desc(studyGuides.createdAt)));
  res.json(rows);
});

router.get("/notebooks/:id/study-guides", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const rows = await db
    .select()
    .from(studyGuides)
    .where(eq(studyGuides.notebookId, id))
    .orderBy(desc(studyGuides.createdAt));
  res.json(rows);
});

router.post("/notebooks/:id/study-guides", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { format, focus } = req.body ?? {};
  if (!(VALID_FORMATS as readonly string[]).includes(format)) {
    res.status(400).json({ error: "invalid format" });
    return;
  }
  const sourceNotes = await db.select().from(notes).where(eq(notes.notebookId, id));
  if (sourceNotes.length === 0) {
    res.status(400).json({ error: "Add notes first." });
    return;
  }
  const sourceText = truncate(sourceNotes.map((n) => `## ${n.title}\n${n.content}`).join("\n\n"));

  const formatPrompts: Record<string, string> = {
    outline: "Produce a thorough hierarchical study outline in Markdown with bolded key terms and clinical pearls.",
    summary: "Produce a concise but complete narrative study summary in Markdown highlighting BOC-relevant concepts.",
    qa: "Produce a comprehensive Q&A-style study guide in Markdown with bolded questions and detailed answers.",
    mindmap: "Produce an indented bullet mindmap in Markdown with the central topic and branches expanding into details.",
  };
  let content: string;
  try {
    content = await chatText(
      `${formatPrompts[format]}${focus ? ` Focus on: ${focus}.` : ""} Material:\n\n${sourceText}`,
      "You are an expert Athletic Training tutor producing high-yield BOC exam study material in Markdown.",
    );
  } catch (err) {
    req.log.error({ err }, "study guide generation failed");
    res.status(502).json({ error: "AI generation failed" });
    return;
  }
  const titleMap: Record<string, string> = {
    outline: "Study Outline",
    summary: "Summary",
    qa: "Q&A Guide",
    mindmap: "Mind Map",
  };
  const [guide] = await db
    .insert(studyGuides)
    .values({ notebookId: id, format, title: focus ? `${titleMap[format]}: ${focus}` : (titleMap[format] ?? "Study Guide"), content })
    .returning();
  res.status(201).json(guide);
});

router.get("/study-guides/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [g] = await db
    .select({
      id: studyGuides.id,
      notebookId: studyGuides.notebookId,
      notebookTitle: notebooks.title,
      title: studyGuides.title,
      format: studyGuides.format,
      content: studyGuides.content,
      createdAt: studyGuides.createdAt,
    })
    .from(studyGuides)
    .innerJoin(notebooks, eq(notebooks.id, studyGuides.notebookId))
    .where(eq(studyGuides.id, id));
  if (!g) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(g);
});

router.delete("/study-guides/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(studyGuides).where(eq(studyGuides.id, id));
  res.sendStatus(204);
});

export default router;
