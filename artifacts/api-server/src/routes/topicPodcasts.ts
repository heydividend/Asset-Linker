import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, audioOverviews, notebooks, notes, topics, domains } from "@workspace/db";
import { parseId } from "./../lib/parseId";
import { chatText } from "./../lib/openaiHelpers";
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
      `Write a focused, friendly ~5-minute spoken podcast script for an Athletic Training student preparing for the BOC exam. ` +
      `Topic: "${topicName}"${domainName ? ` (domain: ${domainName})` : ""}. ` +
      `Follow this strict outline so the listener never gets lost: ` +
      `(1) a 2-sentence intro naming the topic, ` +
      `(2) walk through EXACTLY 4-6 highest-yield concepts, ONE at a time, in a fixed order — finish each concept completely before moving to the next; do not jump between subtopics or circle back, ` +
      `(3) for each concept give a clear definition, one clinical pearl, and one concrete example, ` +
      `(4) close with a 3-bullet recap and a friendly sign-off. ` +
      `If you pose a question to the listener, answer it directly and correctly in the very next sentence — no rhetorical questions left hanging. ` +
      `Write ONLY the spoken script — no stage directions, no markdown, no headings.`;
    const transcript = await chatText(
      prompt,
      "You are a clinical educator writing natural spoken audio for a study app.",
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
