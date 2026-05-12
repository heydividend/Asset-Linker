import { useCallback, useEffect, useState } from "react";

export type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface PlaylistItem {
  id: string;
  text: string;
  voice?: TtsVoice;
}

export interface PlaylistState {
  /** Stable id for the lifetime of this playlist; survives item-array changes. */
  playlistId: number;
  items: PlaylistItem[];
  index: number;
  paused: boolean;
}

export interface SpeechController {
  supported: boolean;
  speakingId: string | null;
  loadingId: string | null;
  voice: TtsVoice;
  setVoice: (v: TtsVoice) => void;
  speak: (id: string, text: string, voiceOverride?: TtsVoice) => Promise<void>;
  stop: () => void;
  isSpeaking: (id: string) => boolean;
  isLoading: (id: string) => boolean;
  // Playlist (sequential read-aloud)
  playlist: PlaylistState | null;
  playPlaylist: (items: PlaylistItem[], startIndex?: number) => Promise<void>;
  pausePlaylist: () => void;
  resumePlaylist: () => void;
  nextPlaylist: () => void;
  prevPlaylist: () => void;
  stopPlaylist: () => void;
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

// Playlist state (singleton, like the audio element)
let playlist: PlaylistState | null = null;
// Monotonic token so a stale resume/next/prev from an old playlist can't
// re-trigger playback after stopPlaylist or a new playPlaylist.
let playlistToken = 0;
// Per-utterance generation token. Bumped on every speak/playlist transition
// so a stale TTS fetch cannot start playback after stop or new-play.
let utteranceToken = 0;
let nextPlaylistId = 1;

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

// Core single-utterance playback. Returns a promise that resolves when the
// clip ends (naturally or via interruption). `onEnded` only fires for natural
// endings, so the playlist driver knows whether to advance.
//
// `gen` is the utterance generation token captured at call time. Any state
// change that should cancel this clip (stop, new speak, new playlist, next/
// prev/skip) bumps `utteranceToken`, so this function can detect supersession
// regardless of whether the new caller reuses the same `id`.
async function playOne(
  id: string,
  text: string,
  voice: TtsVoice,
  onEnded?: () => void,
): Promise<void> {
  const cleaned = plainText(text);
  if (!cleaned) {
    onEnded?.();
    return;
  }
  utteranceToken += 1;
  const gen = utteranceToken;
  teardownAudio();
  activeId = null;
  loadingId = id;
  currentUrl = null;
  notify();

  let url: string;
  try {
    url = await fetchAudioUrl(voice, cleaned);
  } catch (err) {
    if (gen === utteranceToken) {
      loadingId = null;
      notify();
    }
    throw err;
  }

  // Superseded by a newer speak/stop/playlist transition while the fetch was
  // in flight — drop this clip silently.
  if (gen !== utteranceToken) return;

  // If a playlist owns this utterance and it was paused while we fetched,
  // honor the pause: don't auto-start playback. Resume will restart this
  // item via startPlaylistAt.
  if (playlist && playlist.paused) {
    loadingId = null;
    notify();
    return;
  }

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
    onEnded?.();
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
    if (gen !== utteranceToken) {
      // Got superseded after .play() resolved — tear down so we don't leak.
      try { audio.pause(); } catch { /* noop */ }
      return;
    }
    loadingId = null;
    activeId = id;
    notify();
  } catch (err) {
    if (gen === utteranceToken) {
      loadingId = null;
      activeId = null;
      notify();
    }
    throw err;
  }
}

function clearPlaylistInternal() {
  if (playlist !== null) {
    playlist = null;
    notify();
  }
}

async function startPlaylistAt(token: number, index: number): Promise<void> {
  if (token !== playlistToken || !playlist) return;
  if (index < 0 || index >= playlist.items.length) {
    clearPlaylistInternal();
    stopInternal();
    return;
  }
  playlist = { ...playlist, index, paused: false };
  notify();
  const item = playlist.items[index];
  const voice = item.voice ?? currentVoice;
  await playOne(item.id, item.text, voice, () => {
    // Auto-advance only if we're still the active playlist and not paused.
    if (token !== playlistToken || !playlist || playlist.paused) return;
    // Errors here can't be surfaced to a UI handler (we're past the original
    // user-initiated promise). Tear down the playlist so the UI shows a clean
    // stopped state instead of a stuck spinner.
    startPlaylistAt(token, index + 1).catch(() => {
      if (token === playlistToken) {
        clearPlaylistInternal();
        stopInternal();
      }
    });
  });
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
    const onUnload = () => {
      stopInternal();
      clearPlaylistInternal();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  const stop = useCallback(() => {
    // A bare stop also tears down any active playlist so the UI controls
    // don't get stuck in a "playing" state.
    playlistToken += 1;
    utteranceToken += 1;
    clearPlaylistInternal();
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

  const speak = useCallback(
    async (id: string, text: string, voiceOverride?: TtsVoice) => {
      if (!supported) return;
      // Speaking a single message implicitly cancels any active playlist.
      playlistToken += 1;
      clearPlaylistInternal();
      await playOne(id, text, voiceOverride ?? currentVoice);
    },
    [supported],
  );

  const playPlaylist = useCallback(
    async (items: PlaylistItem[], startIndex = 0) => {
      if (!supported || items.length === 0) return;
      playlistToken += 1;
      const token = playlistToken;
      playlist = {
        playlistId: nextPlaylistId++,
        items,
        index: Math.max(0, startIndex),
        paused: false,
      };
      notify();
      await startPlaylistAt(token, playlist.index);
    },
    [supported],
  );

  const pausePlaylist = useCallback(() => {
    if (!playlist || playlist.paused) return;
    playlist = { ...playlist, paused: true };
    if (currentAudio) {
      try {
        currentAudio.pause();
      } catch {
        // noop
      }
    }
    notify();
  }, []);

  const resumePlaylist = useCallback(() => {
    if (!playlist || !playlist.paused) return;
    // If the audio element still holds the current clip, just resume in place.
    if (currentAudio && currentUrl) {
      playlist = { ...playlist, paused: false };
      notify();
      void currentAudio.play().catch(() => {
        // If resume fails, fall back to restarting the current item.
        void startPlaylistAt(playlistToken, playlist!.index);
      });
      return;
    }
    void startPlaylistAt(playlistToken, playlist.index);
  }, []);

  const nextPlaylist = useCallback(() => {
    if (!playlist) return;
    const nextIdx = playlist.index + 1;
    if (nextIdx >= playlist.items.length) {
      playlistToken += 1;
      clearPlaylistInternal();
      stopInternal();
      return;
    }
    playlistToken += 1;
    void startPlaylistAt(playlistToken, nextIdx);
  }, []);

  const prevPlaylist = useCallback(() => {
    if (!playlist) return;
    const prevIdx = Math.max(0, playlist.index - 1);
    playlistToken += 1;
    void startPlaylistAt(playlistToken, prevIdx);
  }, []);

  const stopPlaylist = useCallback(() => {
    playlistToken += 1;
    utteranceToken += 1;
    clearPlaylistInternal();
    stopInternal();
  }, []);

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
    playlist,
    playPlaylist,
    pausePlaylist,
    resumePlaylist,
    nextPlaylist,
    prevPlaylist,
    stopPlaylist,
  };
}
