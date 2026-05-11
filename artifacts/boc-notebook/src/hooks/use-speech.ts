import { useCallback, useEffect, useState } from "react";

export type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface SpeechController {
  supported: boolean;
  speakingId: string | null;
  loadingId: string | null;
  voice: TtsVoice;
  setVoice: (v: TtsVoice) => void;
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  isSpeaking: (id: string) => boolean;
  isLoading: (id: string) => boolean;
}

const VOICE_KEY = "boc.tts.voice";

let activeId: string | null = null;
let loadingId: string | null = null;
let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
let currentVoice: TtsVoice =
  (typeof window !== "undefined" &&
    (localStorage.getItem(VOICE_KEY) as TtsVoice | null)) ||
  "nova";

const subscribers = new Set<() => void>();
function notify() {
  for (const fn of subscribers) fn();
}

// Cache audio blob URLs by `${voice}::${text}` so replays are instant.
const audioCache = new Map<string, string>();
const CACHE_LIMIT = 32;

function cacheGet(key: string): string | null {
  const v = audioCache.get(key);
  if (!v) return null;
  audioCache.delete(key);
  audioCache.set(key, v);
  return v;
}

function cacheSet(key: string, url: string): void {
  if (audioCache.has(key)) audioCache.delete(key);
  audioCache.set(key, url);
  while (audioCache.size > CACHE_LIMIT) {
    const oldestKey = audioCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldestUrl = audioCache.get(oldestKey);
    audioCache.delete(oldestKey);
    if (oldestUrl) URL.revokeObjectURL(oldestUrl);
  }
}

function plainText(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/[*_~>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 4000);
}

function teardownAudio() {
  if (currentAudio) {
    try {
      currentAudio.pause();
    } catch {
      // noop
    }
    currentAudio.onended = null;
    currentAudio.onerror = null;
    currentAudio = null;
  }
}

function stopInternal() {
  teardownAudio();
  if (activeId !== null || loadingId !== null) {
    activeId = null;
    loadingId = null;
    notify();
  }
}

async function fetchAudioUrl(voice: TtsVoice, text: string): Promise<string> {
  const key = `${voice}::${text}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    throw new Error(`TTS failed (${res.status})`);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  cacheSet(key, url);
  return url;
}

export function useSpeech(): SpeechController {
  const [, force] = useState(0);
  const supported = typeof window !== "undefined" && typeof Audio !== "undefined";

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  useEffect(() => {
    const onUnload = () => stopInternal();
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const stop = useCallback(() => {
    stopInternal();
  }, []);

  const setVoice = useCallback((v: TtsVoice) => {
    currentVoice = v;
    try {
      localStorage.setItem(VOICE_KEY, v);
    } catch {
      // noop
    }
    notify();
  }, []);

  const speak = useCallback(async (id: string, text: string) => {
    if (!supported) return;
    const cleaned = plainText(text);
    if (!cleaned) return;

    // Cancel anything currently playing or loading.
    teardownAudio();
    activeId = null;
    loadingId = id;
    currentUrl = null;
    notify();

    const requestVoice = currentVoice;
    let url: string;
    try {
      url = await fetchAudioUrl(requestVoice, cleaned);
    } catch {
      if (loadingId === id) {
        loadingId = null;
        notify();
      }
      return;
    }

    // If a newer speak() was issued before this one resolved, abort.
    if (loadingId !== id) return;

    const audio = new Audio(url);
    currentAudio = audio;
    currentUrl = url;
    audio.onended = () => {
      if (currentAudio === audio) {
        currentAudio = null;
        currentUrl = null;
      }
      if (activeId === id) {
        activeId = null;
        notify();
      }
    };
    audio.onerror = () => {
      if (currentAudio === audio) {
        currentAudio = null;
        currentUrl = null;
      }
      if (activeId === id || loadingId === id) {
        activeId = null;
        loadingId = null;
        notify();
      }
    };
    try {
      await audio.play();
      loadingId = null;
      activeId = id;
      notify();
    } catch {
      if (loadingId === id) loadingId = null;
      if (activeId === id) activeId = null;
      notify();
    }
  }, [supported]);

  return {
    supported,
    speakingId: activeId,
    loadingId,
    voice: currentVoice,
    setVoice,
    speak,
    stop,
    isSpeaking: (id: string) => activeId === id,
    isLoading: (id: string) => loadingId === id,
  };
}
