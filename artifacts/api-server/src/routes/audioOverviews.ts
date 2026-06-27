import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, audioOverviews, notes, studyGuides } from "@workspace/db";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { parseId } from "../lib/parseId";
import { chatText, truncate } from "../lib/openaiHelpers";
import { logger } from "../lib/logger";

type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
const VALID_VOICES: TtsVoice[] = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const normalizeVoice = (v: unknown): TtsVoice =>
  typeof v === "string" && (VALID_VOICES as string[]).includes(v) ? (v as TtsVoice) : "echo";

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

const AUDIO_SELECT = {
  id: audioOverviews.id,
  notebookId: audioOverviews.notebookId,
  studyGuideId: audioOverviews.studyGuideId,
  title: audioOverviews.title,
  status: audioOverviews.status,
  voice: audioOverviews.voice,
  durationSec: audioOverviews.durationSec,
  transcript: audioOverviews.transcript,
  createdAt: audioOverviews.createdAt,
} as const;

const STYLE_PROMPTS: Record<string, string> = {
  lecture:
    "Write a focused 4-6 minute spoken lecture script for an Athletic Training student preparing for the BOC exam. " +
    "Follow this strict outline so the listener never gets lost: (1) one-sentence intro naming the topic, " +
    "(2) cover EXACTLY 4-6 high-yield concepts in order, ONE at a time — finish each concept fully before moving to the next, " +
    "(3) for each concept give a clear definition, a clinical pearl, and a concrete example, " +
    "(4) close with a 3-bullet recap. Do not jump between subtopics or circle back.",
  podcast:
    "Write a friendly 5-7 minute podcast-style script for two co-hosts (alternating, label A: and B:) discussing the material for a BOC student. " +
    "Follow a strict outline: cover 4-6 high-yield concepts ONE at a time, finishing each fully before moving on. " +
    "If one host asks a question, the very next line MUST be the other host giving a clear, direct, factually correct answer to that exact question — no tangents.",
  quickrecap: "Write a tight 2-3 minute spoken recap of the key BOC-relevant concepts, covered one at a time in a fixed order. Do not jump between subtopics.",
  podcast2host:
    "Write a focused 5-7 minute two-host podcast script for an Athletic Training BOC student. " +
    "Open with a 2-sentence intro that names the topic. " +
    "Then alternate strictly between `HOST A:` and `HOST B:` and follow this rigid outline: cover EXACTLY 4-6 high-yield concepts, ONE at a time, in a fixed order — finish each concept completely before moving to the next. " +
    "RULE: If a host asks a question, the next line MUST be the other host giving a clear, direct, factually correct answer to THAT specific question (no deflecting, no changing the subject). " +
    "Avoid rhetorical questions; only ask a question if the next line will answer it plainly. " +
    "Use plain conversational language, concrete clinical examples, and short sentences. " +
    "Close with a short outro that recaps the 3-5 highest-yield takeaways and a friendly sign-off.",
};

async function startGeneration(opts: {
  overviewId: number;
  voice: TtsVoice;
  style: string;
  focus?: string;
  source: string;
}): Promise<void> {
  const { overviewId, voice, style, focus, source } = opts;
  try {
    const promptHeader = STYLE_PROMPTS[style] ?? STYLE_PROMPTS.lecture;
    logger.info({ overviewId, style, voice }, "audio-overview: generating transcript");
    const transcript = await chatText(
      `${promptHeader}${focus ? ` Focus on: ${focus}.` : ""} Material:\n\n${source}\n\nWrite ONLY the spoken script — no stage directions, no markdown, no headings. For two-host scripts keep the speaker labels (HOST A: / HOST B: or A: / B:) on each line.`,
      "You are a clinical educator writing natural spoken audio for a study app.",
    );
    if (!transcript || transcript.trim().length === 0) {
      throw new Error("Transcript generation returned empty text");
    }
    const chunks = chunkForTts(transcript);
    logger.info({ overviewId, chars: transcript.length, chunks: chunks.length }, "audio-overview: synthesizing speech");
    const audioParts: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const t0 = Date.now();
      const part = await textToSpeech(chunks[i], voice, "mp3");
      if (!part || part.length === 0) {
        throw new Error(`TTS chunk ${i + 1}/${chunks.length} returned empty audio buffer`);
      }
      audioParts.push(part);
      logger.info(
        { overviewId, chunk: i + 1, total: chunks.length, ms: Date.now() - t0, bytes: part.length },
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
      .where(eq(audioOverviews.id, overviewId));
    logger.info({ overviewId, audioBytes: buf.length }, "audio-overview: ready");
  } catch (err) {
    logger.error({ err, overviewId }, "audio-overview: generation failed");
    await db
      .update(audioOverviews)
      .set({ status: "failed" })
      .where(eq(audioOverviews.id, overviewId));
  }
}

const router: IRouter = Router();

router.get("/notebooks/:id/audio-overviews", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const rows = await db
    .select(AUDIO_SELECT)
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

  const source = truncate(sourceNotes.map((n) => `## ${n.title}\n${n.content}`).join("\n\n"), 8000);
  void startGeneration({ overviewId: pending.id, voice, style, focus, source });

  res.status(202).json({
    id: pending.id,
    notebookId: pending.notebookId,
    studyGuideId: pending.studyGuideId,
    title: pending.title,
    status: pending.status,
    voice: pending.voice,
    durationSec: pending.durationSec,
    transcript: pending.transcript,
    createdAt: pending.createdAt,
  });
});

router.get("/study-guides/:id/audio-overviews", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const rows = await db
    .select(AUDIO_SELECT)
    .from(audioOverviews)
    .where(eq(audioOverviews.studyGuideId, id))
    .orderBy(desc(audioOverviews.createdAt));
  res.json(rows);
});

router.post("/study-guides/:id/audio-overviews", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const voice = normalizeVoice((req.body ?? {}).voice);
  const { focus } = req.body ?? {};
  const [guide] = await db.select().from(studyGuides).where(eq(studyGuides.id, id));
  if (!guide) {
    res.status(404).json({ error: "Study guide not found" });
    return;
  }
  const source = truncate(`# ${guide.title}\n\n${guide.content}`, 8000);
  const [pending] = await db
    .insert(audioOverviews)
    .values({
      notebookId: guide.notebookId,
      studyGuideId: guide.id,
      title: `Podcast: ${guide.title}`,
      status: "pending",
      voice,
      style: "podcast2host",
    })
    .returning();
  void startGeneration({ overviewId: pending.id, voice, style: "podcast2host", focus, source });
  res.status(202).json({
    id: pending.id,
    notebookId: pending.notebookId,
    studyGuideId: pending.studyGuideId,
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
    .select(AUDIO_SELECT)
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
