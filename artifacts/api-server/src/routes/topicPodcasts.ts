import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, audioOverviews, notebooks, notes, topics, domains } from "@workspace/db";
import { parseId } from "./../lib/parseId";
import { chatText, DEFAULT_MODEL } from "./../lib/openaiHelpers";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { logger } from "./../lib/logger";

type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
const VALID_VOICES: TtsVoice[] = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const normalizeVoice = (v: unknown): TtsVoice =>
  typeof v === "string" && (VALID_VOICES as string[]).includes(v) ? (v as TtsVoice) : "nova";

const TOPIC_PODCAST_NOTEBOOK_TITLE = "Topic Podcasts";

async function getOrCreateTopicPodcastNotebook(): Promise<{ id: number }> {
  const [existing] = await db
    .select({ id: notebooks.id })
    .from(notebooks)
    .where(eq(notebooks.title, TOPIC_PODCAST_NOTEBOOK_TITLE))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(notebooks)
    .values({
      title: TOPIC_PODCAST_NOTEBOOK_TITLE,
      description: "Auto-generated 5-minute podcasts for weak BOC topics.",
    })
    .returning({ id: notebooks.id });
  return created;
}

const MAX_TTS_CHARS = 2800;
function chunkForTts(text: string, maxChars = MAX_TTS_CHARS): string[] {
  const clean = text.trim();
  if (clean.length <= maxChars) return [clean];
  const sentences = clean.match(/[^.!?\n]+[.!?]+["')\]]?|\S[^.!?\n]*$/g) ?? [clean];
  const chunks: string[] = [];
  let buf = "";
  for (const s of sentences) {
    const piece = s.trim();
    if (!piece) continue;
    if (buf.length + piece.length + 1 > maxChars) {
      if (buf) chunks.push(buf);
      buf = piece;
    } else {
      buf = buf ? `${buf} ${piece}` : piece;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

async function generateTopicPodcastInBackground(opts: {
  overviewId: number;
  topicName: string;
  domainName: string | null;
  voice: TtsVoice;
}): Promise<void> {
  const { overviewId, topicName, domainName, voice } = opts;
  try {
    const prompt =
      `You are recording an insightful ~5-minute audio podcast episode that TEACHES an Athletic Training student preparing for the BOC exam THROUGH ANALYSIS — not by reading notes aloud. ` +
      `Topic: "${topicName}"${domainName ? ` (domain: ${domainName})` : ""}. ` +
      `Do NOT recite textbook definitions. Instead, explain the reasoning behind the material: WHY each concept matters clinically and on the exam, the mechanism or logic underneath it, how the ideas connect into one mental model, the common misconceptions, and the exam traps students fall for. Use vivid analogies and concrete clinical scenarios so it sticks. ` +
      `Keep the listener oriented with a clear through-line: ` +
      `(1) a short hook plus a 2-sentence intro framing why this topic matters in the clinic and on the exam, ` +
      `(2) work through 4-6 highest-yield ideas ONE at a time in a logical order — fully finish each before the next; do not jump around or circle back, ` +
      `(3) for each idea give the "so what": the underlying reasoning, a concrete clinical example, and the mistake to avoid, ` +
      `(4) explicitly draw the connections between the ideas so they form a coherent model, ` +
      `(5) close with a punchy 3-point recap and a motivating sign-off. ` +
      `Speak in a warm, energetic, conversational podcast voice (first person, speaking directly to "you"). If you pose a question, answer it correctly in the very next sentence — no rhetorical questions left hanging. ` +
      `Write ONLY the spoken words — no stage directions, speaker labels, sound cues, markdown, or headings.`;
    const transcript = await chatText(
      prompt,
      "You are an expert Athletic Training educator and a skilled podcast host who teaches through sharp analysis, clinical reasoning, and storytelling — never by reading text verbatim.",
      DEFAULT_MODEL,
    );
    if (!transcript || transcript.trim().length === 0) {
      throw new Error("Transcript generation returned empty text");
    }
    const chunks = chunkForTts(transcript);
    const audioParts: Buffer[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const part = await textToSpeech(chunks[i], voice, "mp3");
      if (!part || part.length === 0) {
        throw new Error(`TTS chunk ${i + 1}/${chunks.length} returned empty audio buffer`);
      }
      audioParts.push(part);
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
    logger.info({ overviewId, topicName, audioBytes: buf.length }, "topic-podcast: ready");
  } catch (err) {
    logger.error({ err, overviewId, topicName }, "topic-podcast: generation failed");
    await db
      .update(audioOverviews)
      .set({ status: "failed" })
      .where(eq(audioOverviews.id, overviewId));
  }
}

const router: IRouter = Router();

router.post("/topics/:id/podcasts", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [topic] = await db.select().from(topics).where(eq(topics.id, id));
  if (!topic) {
    res.status(404).json({ error: "Topic not found" });
    return;
  }
  let domainName: string | null = null;
  if (topic.domainId) {
    const [d] = await db.select().from(domains).where(eq(domains.id, topic.domainId));
    if (d) domainName = d.name;
  }
  const voice = normalizeVoice((req.body ?? {}).voice);

  // De-dup: if a fresh podcast for this topic already exists in the same
  // hosting notebook (same title), reuse it instead of regenerating. Keeps
  // the Weak Topics quick-action idempotent during a study session.
  const hostNotebook = await getOrCreateTopicPodcastNotebook();
  const podcastTitle = `5-min podcast: ${topic.name}`;
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [recent] = await db
    .select()
    .from(audioOverviews)
    .where(
      and(
        eq(audioOverviews.notebookId, hostNotebook.id),
        eq(audioOverviews.title, podcastTitle),
      ),
    )
    .orderBy(desc(audioOverviews.createdAt))
    .limit(1);
  if (recent && recent.createdAt >= since && recent.status !== "failed") {
    res.status(202).json({
      id: recent.id,
      notebookId: recent.notebookId,
      studyGuideId: recent.studyGuideId,
      title: recent.title,
      status: recent.status,
      voice: recent.voice,
      durationSec: recent.durationSec,
      transcript: recent.transcript,
      createdAt: recent.createdAt,
    });
    return;
  }

  // Make sure the hosting notebook has at least one note to satisfy any
  // downstream tooling that scans its notes (the audio-overviews summary
  // endpoint groups by notebook). Cheap idempotent insert.
  const existingNotes = await db
    .select({ id: notes.id })
    .from(notes)
    .where(eq(notes.notebookId, hostNotebook.id))
    .limit(1);
  if (existingNotes.length === 0) {
    await db.insert(notes).values({
      notebookId: hostNotebook.id,
      title: "About this notebook",
      content:
        "Auto-generated home for short topic podcasts launched from the BOC dashboard.",
      sourceKind: "system",
    });
  }

  const [pending] = await db
    .insert(audioOverviews)
    .values({
      notebookId: hostNotebook.id,
      title: podcastTitle,
      status: "pending",
      voice,
      style: "lecture",
    })
    .returning();

  void generateTopicPodcastInBackground({
    overviewId: pending.id,
    topicName: topic.name,
    domainName,
    voice,
  });

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

export default router;
