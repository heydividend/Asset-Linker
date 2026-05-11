import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, audioOverviews, notes } from "@workspace/db";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { parseId } from "../lib/parseId";
import { chatText, truncate } from "../lib/openaiHelpers";
import { logger } from "../lib/logger";

type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
const VALID_VOICES: TtsVoice[] = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const normalizeVoice = (v: unknown): TtsVoice =>
  typeof v === "string" && (VALID_VOICES as string[]).includes(v) ? (v as TtsVoice) : "nova";

const MAX_TTS_CHARS = 2800;

// Split text into sentence-aware chunks so each chunk fits gpt-audio's tight token budget.
function chunkForTts(text: string, maxChars = MAX_TTS_CHARS): string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) return [clean];
  const sentences = clean.match(/[^.!?\n]+[.!?]+["')\]]?|\S[^.!?\n]*$/g) ?? [clean];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (piece.length > maxChars) {
      if (buf) { chunks.push(buf); buf = ""; }
      for (let i = 0; i < piece.length; i += maxChars) chunks.push(piece.slice(i, i + maxChars));
      continue;
    }
    if (buf.length + piece.length + 1 > maxChars) {
      chunks.push(buf);
      buf = piece;
    } else {
      buf = buf ? `${buf} ${piece}` : piece;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

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
  const voice = normalizeVoice((req.body ?? {}).voice);
  const { style = "lecture", focus } = req.body ?? {};
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
      logger.info({ overviewId: pending.id, style, voice }, "audio-overview: generating transcript");
      const transcript = await chatText(
        `${stylePrompts[style] ?? stylePrompts.lecture}${focus ? ` Focus on: ${focus}.` : ""} Material:\n\n${sourceText}\n\nWrite ONLY the spoken script — no stage directions, no headings, no markdown.`,
        "You are a clinical educator writing natural spoken audio for a study app.",
      );
      if (!transcript || transcript.trim().length === 0) {
        throw new Error("Transcript generation returned empty text");
      }
      const chunks = chunkForTts(transcript);
      logger.info({ overviewId: pending.id, chars: transcript.length, chunks: chunks.length }, "audio-overview: synthesizing speech");
      const audioParts: Buffer[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const t0 = Date.now();
        const part = await textToSpeech(chunks[i], voice, "mp3");
        if (!part || part.length === 0) {
          throw new Error(`TTS chunk ${i + 1}/${chunks.length} returned empty audio buffer`);
        }
        audioParts.push(part);
        logger.info(
          { overviewId: pending.id, chunk: i + 1, total: chunks.length, ms: Date.now() - t0, bytes: part.length },
          "audio-overview: chunk synthesized",
        );
      }
      const buf = Buffer.concat(audioParts);
      await db
        .update(audioOverviews)
        .set({
          status: "ready",
          transcript,
          audioData: buf,
          durationSec: Math.round(transcript.length / 15),
        })
        .where(eq(audioOverviews.id, pending.id));
      logger.info({ overviewId: pending.id, audioBytes: buf.length }, "audio-overview: ready");
    } catch (err) {
      logger.error({ err, overviewId: pending.id }, "audio-overview: generation failed");
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
