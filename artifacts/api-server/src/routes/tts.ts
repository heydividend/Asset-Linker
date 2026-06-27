import { Router, type IRouter } from "express";
import { textToSpeech } from "@workspace/integrations-openai-ai-server/audio";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const VALID_VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"] as const;
type Voice = (typeof VALID_VOICES)[number];

// Tiny in-memory cache so repeated requests for the same text+voice don't
// regenerate audio. Keyed by `${voice}::${text}` and capped to keep memory
// bounded.
const CACHE_LIMIT = 64;
const cache = new Map<string, Buffer>();

function cacheGet(key: string): Buffer | null {
  const v = cache.get(key);
  if (!v) return null;
  // refresh LRU position
  cache.delete(key);
  cache.set(key, v);
  return v;
}

function cacheSet(key: string, buf: Buffer): void {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, buf);
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

router.post("/tts", async (req, res): Promise<void> => {
  const { text, voice } = (req.body ?? {}) as { text?: unknown; voice?: unknown };
  if (typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const trimmed = text.trim().slice(0, 4000);
  const v: Voice =
    typeof voice === "string" && (VALID_VOICES as readonly string[]).includes(voice)
      ? (voice as Voice)
      : "echo";
  const key = `${v}::${trimmed}`;
  const cached = cacheGet(key);
  if (cached) {
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-TTS-Cache", "hit");
    res.send(cached);
    return;
  }
  try {
    const buf = await textToSpeech(trimmed, v, "mp3");
    if (!buf || buf.length === 0) {
      res.status(502).json({ error: "Empty audio response" });
      return;
    }
    cacheSet(key, buf);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.setHeader("X-TTS-Cache", "miss");
    res.send(buf);
  } catch (err) {
    logger.error({ err }, "tts: synthesis failed");
    res.status(500).json({ error: "TTS failed" });
  }
});

export default router;
