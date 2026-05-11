import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, studyGuides, notes } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { chatText, truncate } from "../lib/openaiHelpers";

const router: IRouter = Router();

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
  if (!["outline", "summary", "qa", "mindmap"].includes(format)) {
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
  const [g] = await db.select().from(studyGuides).where(eq(studyGuides.id, id));
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
