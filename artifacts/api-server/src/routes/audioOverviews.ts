import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, audioOverviews, notes } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { parseId } from "../lib/parseId";
import { chatText, truncate } from "../lib/openaiHelpers";

const router: IRouter = Router();

router.get("/notebooks/:id/audio-overviews", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const rows = await db
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
    .orderBy(desc(audioOverviews.createdAt));
  res.json(rows);
});

router.post("/notebooks/:id/audio-overviews", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const { voice = "nova", style = "lecture", focus } = req.body ?? {};
  const sourceNotes = await db.select().from(notes).where(eq(notes.notebookId, id));
  if (sourceNotes.length === 0) {
    res.status(400).json({ error: "Add notes first." });
    return;
  }

  const [pending] = await db
    .insert(audioOverviews)
    .values({
      notebookId: id,
      title: focus ? `${style} on ${focus}` : `${style} overview`,
      status: "pending",
      voice,
      style,
    })
    .returning();

  // Generate transcript + TTS in background
  (async () => {
    try {
      const sourceText = truncate(sourceNotes.map((n) => `## ${n.title}\n${n.content}`).join("\n\n"), 8000);
      const stylePrompts: Record<string, string> = {
        lecture: "Write a focused 4-6 minute spoken lecture script for an Athletic Training student preparing for the BOC exam.",
        podcast: "Write a friendly 5-7 minute podcast-style script for two co-hosts (alternating, label A: and B:) discussing the material for a BOC student.",
        quickrecap: "Write a tight 2-3 minute spoken recap of the key BOC-relevant concepts.",
      };
      const transcript = await chatText(
        `${stylePrompts[style] ?? stylePrompts.lecture}${focus ? ` Focus on: ${focus}.` : ""} Material:\n\n${sourceText}\n\nWrite ONLY the spoken script — no stage directions, no headings, no markdown.`,
        "You are a clinical educator writing natural spoken audio for a study app.",
      );
      const speech = await openai.audio.speech.create({
        model: "gpt-4o-mini-tts",
        voice,
        input: transcript.slice(0, 4000),
      });
      const buf = Buffer.from(await speech.arrayBuffer());
      await db
        .update(audioOverviews)
        .set({
          status: "ready",
          transcript,
          audioData: buf,
          durationSec: Math.round(transcript.length / 15),
        })
        .where(eq(audioOverviews.id, pending.id));
    } catch (err) {
      await db
        .update(audioOverviews)
        .set({ status: "failed" })
        .where(eq(audioOverviews.id, pending.id));
    }
  })();

  res.status(202).json({
    id: pending.id,
    notebookId: pending.notebookId,
    title: pending.title,
    status: pending.status,
    voice: pending.voice,
    durationSec: pending.durationSec,
    transcript: pending.transcript,
    createdAt: pending.createdAt,
  });
});

router.get("/audio-overviews/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [row] = await db
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
    .where(eq(audioOverviews.id, id));
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row);
});

router.get("/audio-overviews/:id/audio", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [row] = await db
    .select({ audioData: audioOverviews.audioData, status: audioOverviews.status })
    .from(audioOverviews)
    .where(eq(audioOverviews.id, id));
  if (!row || !row.audioData) {
    res.status(404).json({ error: "Audio not ready" });
    return;
  }
  res.setHeader("Content-Type", "audio/mpeg");
  res.setHeader("Content-Length", String(row.audioData.length));
  res.setHeader("Accept-Ranges", "bytes");
  res.send(row.audioData);
});

router.delete("/audio-overviews/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(audioOverviews).where(eq(audioOverviews.id, id));
  res.sendStatus(204);
});

export default router;
