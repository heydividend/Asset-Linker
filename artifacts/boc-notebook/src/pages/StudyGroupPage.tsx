import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStudyGroupSessions,
  useGetStudyGroupSession,
  useCreateStudyGroupSession,
  useUpdateStudyGroupSession,
  useDeleteStudyGroupSession,
  usePromoteStudyGroupArtifact,
  useGetStudyGroupLearningSignal,
  useGetStudyGroupLibrary,
  useListTopics,
  useListDomains,
  useGetDashboardSummary,
  getGetStudyGroupSessionQueryKey,
  getListStudyGroupSessionsQueryKey,
  getGetStudyGroupLearningSignalQueryKey,
  type StudyGroupMessage,
  type StudyGroupArtifact,
  type StudyGroupSession,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { useToast } from "@/hooks/use-toast";
import { useChatStore } from "@/hooks/use-chat";
import { useSpeech, type TtsVoice } from "@/hooks/use-speech";
import {
  GraduationCap,
  Headphones,
  Loader2,
  Pause,
  Play,
  Plus,
  Send,
  SkipBack,
  SkipForward,
  Sparkles,
  Square,
  Trash2,
  Users,
  Volume2,
  Wand2,
  Stethoscope,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  BookOpen,
  FileQuestion,
  Library as LibraryIcon,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TempMessage = StudyGroupMessage & { __pending?: boolean };

interface SpeakerStyle {
  initials: string;
  label: string;
  badge: string;
  ring: string;
  icon: typeof GraduationCap;
  /** Per-persona TTS voice. Falls back to user voice when undefined. */
  voice?: TtsVoice;
}

const SPEAKERS: Record<string, SpeakerStyle> = {
  mentor: {
    initials: "DM",
    label: "Dr. Mentor",
    badge: "Graduate Professor",
    ring: "bg-amber-500 text-white",
    icon: GraduationCap,
    voice: "onyx", // deep, authoritative
  },
  alex: {
    initials: "A",
    label: "Alex",
    badge: "BOC-certified peer",
    ring: "bg-sky-500 text-white",
    icon: Sparkles,
    voice: "nova", // warm, energetic peer
  },
  jordan: {
    initials: "J",
    label: "Jordan",
    badge: "BOC-certified peer · 4 yrs clinic",
    ring: "bg-emerald-500 text-white",
    icon: Stethoscope,
    voice: "echo", // calm, clinical
  },
  student: {
    initials: "You",
    label: "You",
    badge: "Student",
    ring: "bg-primary text-primary-foreground",
    icon: Users,
    voice: "shimmer",
  },
  system: {
    initials: "·",
    label: "System",
    badge: "",
    ring: "bg-muted text-muted-foreground",
    icon: Users,
  },
};

const KIND_LABELS: Record<string, string> = {
  question: "poses the question",
  answer: "answers",
  reasoning: "reasoning",
  verdict: "verdict",
  takeaway: "takeaway",
  interjection: "asks the group",
  response: "responds",
  system: "",
};

function speakerStyle(s: string): SpeakerStyle {
  return SPEAKERS[s] ?? SPEAKERS.system;
}

function MessageBubble({
  message,
  highlighted,
  isPlaying,
}: {
  message: TempMessage;
  highlighted?: boolean;
  isPlaying?: boolean;
}) {
  const style = speakerStyle(message.speaker);
  const kindLabel = KIND_LABELS[message.kind] ?? message.kind;
  const isStudent = message.speaker === "student";
  const isSystem = message.speaker === "system";
  const isFailed = (message as { status?: string }).status === "failed";
  const speakId = `sg-msg-${message.id}`;
  const speech = useSpeech();
  const speakingThis = speech.isSpeaking(speakId);
  const loadingThis = speech.isLoading(speakId);
  const canSpeak =
    speech.supported && !isSystem && Boolean(message.content) && !message.__pending;
  if (isSystem) {
    return (
      <div className="flex justify-center py-1">
        <div className="text-[11px] text-muted-foreground italic max-w-2xl text-center">
          <MarkdownMessage content={message.content} className="prose-p:m-0" />
        </div>
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex gap-3 items-start rounded-md transition-colors",
        isStudent && "flex-row-reverse",
        highlighted && "bg-amber-100/40 dark:bg-amber-900/20 ring-2 ring-amber-300 p-2 -mx-2",
        isPlaying && "bg-primary/5 ring-2 ring-primary/40 p-2 -mx-2",
      )}
      data-testid={`sg-msg-${message.id}`}
      data-round={message.roundIndex}
    >
      <div
        className={cn(
          "h-9 w-9 rounded-full grid place-items-center text-[12px] font-semibold shrink-0",
          style.ring,
        )}
        title={style.label}
      >
        {style.initials}
      </div>
      <div className={cn("flex-1 min-w-0 max-w-[85%]", isStudent && "flex flex-col items-end")}>
        <div
          className={cn(
            "text-[11px] flex items-center gap-1.5 mb-0.5",
            isStudent && "flex-row-reverse",
          )}
        >
          <span className="font-medium">{style.label}</span>
          {style.badge && (
            <Badge variant="outline" className="px-1.5 py-0 h-4 text-[10px] font-normal">
              {style.badge}
            </Badge>
          )}
          {kindLabel && (
            <span className="text-muted-foreground">· {kindLabel}</span>
          )}
          {canSpeak && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (speakingThis || loadingThis) {
                  speech.stop();
                } else {
                  void speech.speak(speakId, message.content, style.voice);
                }
              }}
              className={cn(
                "ml-1 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-accent transition-colors",
                (speakingThis || loadingThis || isPlaying) && "text-primary",
              )}
              title={
                speakingThis
                  ? "Stop"
                  : loadingThis
                    ? "Loading voice…"
                    : `Read with ${style.label}'s voice`
              }
              aria-label={speakingThis ? "Stop reading" : `Read with ${style.label}'s voice`}
              aria-pressed={speakingThis}
              data-testid={`button-sg-speak-${message.id}`}
            >
              {loadingThis ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : speakingThis ? (
                <Square className="h-3 w-3" />
              ) : (
                <Volume2 className="h-3 w-3" />
              )}
            </button>
          )}
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 border bg-card text-card-foreground",
            isStudent && "bg-primary/5 border-primary/30",
            message.kind === "verdict" && "bg-amber-50 dark:bg-amber-950/30 border-amber-300/60",
            message.kind === "takeaway" && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300/60",
            isFailed && "bg-rose-50 dark:bg-rose-950/30 border-rose-300/60",
            message.__pending && "opacity-90",
          )}
        >
          <MarkdownMessage
            content={
              message.content ||
              (isFailed
                ? "_(turn was interrupted — click **Retry last round** to pick up here)_"
                : message.__pending
                  ? "_typing…_"
                  : "")
            }
          />
        </div>
      </div>
    </div>
  );
}

function ArtifactCard({
  artifact,
  onPromote,
  promoting,
}: {
  artifact: StudyGroupArtifact;
  onPromote: (a: StudyGroupArtifact) => void;
  promoting: boolean;
}) {
  const promoted = artifact.promotedRefId != null;
  const canPromote =
    !promoted && (artifact.kind === "flashcard_candidate" || artifact.kind === "question_candidate");
  const payload = artifact.payload as Record<string, unknown>;
  let title: string;
  let body: React.ReactNode;
  if (artifact.kind === "flashcard_candidate") {
    title = "Candidate flashcard";
    body = (
      <>
        <p className="text-xs font-medium">{String(payload.front ?? "")}</p>
        <p className="text-xs text-muted-foreground mt-1">{String(payload.back ?? "")}</p>
      </>
    );
  } else if (artifact.kind === "question_candidate") {
    title = "Candidate question";
    const choices = (payload.choices as string[] | undefined) ?? [];
    const ci = payload.correctIndex as number | undefined;
    body = (
      <>
        <p className="text-xs font-medium">{String(payload.stem ?? "")}</p>
        <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
          {choices.map((c, i) => (
            <li key={i} className={i === ci ? "text-emerald-600 dark:text-emerald-400 font-medium" : ""}>
              {String.fromCharCode(65 + i)}. {c}
            </li>
          ))}
        </ul>
      </>
    );
  } else if (artifact.kind === "reasoning_pattern") {
    title = "Reasoning pattern";
    body = <p className="text-xs text-muted-foreground">{String(payload.note ?? "")}</p>;
  } else {
    title = "Mastery signal";
    const dir = payload.direction as string | undefined;
    body = (
      <p className="text-xs text-muted-foreground">
        {dir && (
          <Badge variant="outline" className="mr-1 px-1.5 py-0 h-4 text-[10px]">
            {dir}
          </Badge>
        )}
        {String(payload.note ?? "")}
      </p>
    );
  }
  return (
    <div className="rounded-md border p-2.5 bg-card" data-testid={`sg-artifact-${artifact.id}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4">
          R{artifact.roundIndex}
        </Badge>
      </div>
      {body}
      {canPromote && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-2 h-7 text-[12px] w-full"
          onClick={() => onPromote(artifact)}
          disabled={promoting}
          data-testid={`button-promote-artifact-${artifact.id}`}
        >
          {promoting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Plus className="h-3 w-3 mr-1" />}
          {artifact.kind === "flashcard_candidate" ? "Save as flashcard" : "Add to question bank"}
        </Button>
      )}
      {promoted && (
        <div className="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Promoted (#{artifact.promotedRefId})
        </div>
      )}
    </div>
  );
}

interface SessionPanelProps {
  session: StudyGroupSession;
  focusRound?: { round: number; nonce: number } | null;
}

function SessionPanel({ session, focusRound }: SessionPanelProps) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const detailKey = getGetStudyGroupSessionQueryKey(session.id);
  const { data: detail } = useGetStudyGroupSession(session.id);
  const updateStatus = useUpdateStudyGroupSession();
  const promote = usePromoteStudyGroupArtifact();

  const [pendingMessages, setPendingMessages] = useState<TempMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [interjection, setInterjection] = useState("");
  const [promotingId, setPromotingId] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const transcriptRef = useRef<HTMLDivElement>(null);

  const merged = useMemo(() => {
    // Hide planned-turn placeholders that haven't been spoken yet (status
    // pending/streaming with no content) — those are filled in by the live
    // SSE stream's pending messages. Streaming rows WITH content are kept so
    // a reload mid-turn shows the checkpointed partial text immediately.
    const persisted = ((detail?.messages ?? []) as TempMessage[]).filter((m) => {
      const status = (m as { status?: string }).status;
      if (!status || status === "done" || status === "failed") return true;
      return Boolean(m.content);
    });
    // When the live stream and the persisted row refer to the same DB row
    // (matched by id), prefer the live pending version — its content is
    // strictly fresher than the throttled DB checkpoint.
    const pendingById = new Map(pendingMessages.map((m) => [m.id, m]));
    const result: TempMessage[] = persisted.map((m) => pendingById.get(m.id) ?? m);
    const persistedIds = new Set(persisted.map((m) => m.id));
    for (const p of pendingMessages) {
      if (!persistedIds.has(p.id)) result.push(p);
    }
    return result;
  }, [detail, pendingMessages]);

  // Detect resume/retry state from the persisted transcript.
  const { incompleteRound, hasFailed } = useMemo(() => {
    const msgs = (detail?.messages ?? []) as (TempMessage & { status?: string; turnOrder?: number })[];
    const planned = msgs.filter((m) =>
      ["question", "answer", "verdict", "takeaway"].includes(m.kind),
    );
    const incomplete = planned.filter(
      (m) => m.status && m.status !== "done",
    );
    const failed = incomplete.some((m) => m.status === "failed");
    let round: number | null = null;
    if (incomplete.length > 0) {
      round = Math.min(...incomplete.map((m) => m.roundIndex));
    } else if (session.pendingExtractionRound != null) {
      round = session.pendingExtractionRound;
    }
    return { incompleteRound: round, hasFailed: failed };
  }, [detail, session.pendingExtractionRound]);
  const canResume = incompleteRound != null && !streaming;

  // Auto-resume the live stream when a session is reopened mid-turn so the
  // user doesn't have to click "Resume round" to keep watching the partial
  // grow. We only auto-trigger once per detected incomplete round, and skip
  // when the session is paused (manual override) or when a turn explicitly
  // failed — in those cases the user should click Retry/Resume themselves.
  const autoResumedRoundRef = useRef<number | null>(null);
  useEffect(() => {
    if (incompleteRound == null) {
      autoResumedRoundRef.current = null;
      return;
    }
    if (streaming) return;
    if (session.status === "paused") return;
    if (hasFailed) return;
    if (autoResumedRoundRef.current === incompleteRound) return;
    autoResumedRoundRef.current = incompleteRound;
    void handleStartRound();
    // handleStartRound is intentionally omitted — it's a stable closure within
    // this component and including it would re-fire the effect every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incompleteRound, streaming, hasFailed, session.status, session.id]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [merged.length, pendingMessages]);

  // Scroll to + highlight the first message of the focused round whenever the
  // Library tab deep-links into this session.
  useEffect(() => {
    if (!focusRound || !transcriptRef.current) return;
    const container = transcriptRef.current;
    // Wait for messages to render before locating the round bubble.
    const id = window.setTimeout(() => {
      const target = container.querySelector<HTMLElement>(
        `[data-round="${focusRound.round}"]`,
      );
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [focusRound, merged.length]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  async function consumeSseStream(url: string, body: unknown) {
    setStreaming(true);
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    let pendingId = -Date.now();
    const newPending: TempMessage[] = [];
    setPendingMessages([]);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        toast({ title: "Round failed", description: errText || res.statusText, variant: "destructive" });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let current: TempMessage | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let evt: any;
          try {
            evt = JSON.parse(line.slice(6));
          } catch {
            continue;
          }
          if (evt.type === "message_start") {
            // Prefer the server-provided messageId so the merged transcript
            // can dedupe this pending row against the persisted (throttled)
            // partial of the same DB row on a mid-stream reload.
            const id =
              typeof evt.messageId === "number" ? evt.messageId : --pendingId;
            current = {
              id,
              sessionId: session.id,
              speaker: evt.speaker,
              kind: evt.kind,
              content: "",
              roundIndex: evt.roundIndex ?? 0,
              questionId: null,
              createdAt: new Date().toISOString() as unknown as string,
              __pending: true,
            } as unknown as TempMessage;
            newPending.push(current);
            setPendingMessages([...newPending]);
          } else if (evt.type === "message_delta" && current) {
            current.content += evt.content ?? "";
            setPendingMessages([...newPending]);
          } else if (evt.type === "message_end") {
            if (current) {
              current.content = evt.content ?? current.content;
              current.__pending = false;
              setPendingMessages([...newPending]);
              current = null;
            } else {
              // Direct push (e.g. student interjection echo from server)
              const msg = {
                id: evt.messageId ?? --pendingId,
                sessionId: session.id,
                speaker: evt.speaker,
                kind: evt.kind,
                content: evt.content ?? "",
                roundIndex: evt.roundIndex ?? 0,
                questionId: null,
                createdAt: new Date().toISOString(),
              } as unknown as TempMessage;
              newPending.push(msg);
              setPendingMessages([...newPending]);
            }
          } else if (evt.type === "artifact") {
            // Refresh detail so artifacts show up
            qc.invalidateQueries({ queryKey: detailKey });
          } else if (evt.type === "error") {
            toast({
              title: `${speakerStyle(evt.speaker ?? "system").label} hit a hiccup`,
              description: evt.error ?? "Try the round again.",
              variant: "destructive",
            });
          } else if (evt.done) {
            // final
          }
        }
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        toast({
          title: "Stream interrupted",
          description: err?.message ?? "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      setStreaming(false);
      qc.invalidateQueries({ queryKey: detailKey });
      qc.invalidateQueries({ queryKey: getListStudyGroupSessionsQueryKey() });
      qc.invalidateQueries({ queryKey: getGetStudyGroupLearningSignalQueryKey() });
      // Clear pending after a tick to avoid double-render
      setTimeout(() => setPendingMessages([]), 200);
    }
  }

  async function handleStartRound(opts: { retry?: boolean } = {}) {
    await consumeSseStream(
      `/api/study-group/sessions/${session.id}/round`,
      opts.retry ? { retry: true } : {},
    );
  }

  function handlePauseResume() {
    const next = session.status === "paused" ? "active" : "paused";
    if (session.status === "active" && streaming) {
      abortRef.current?.abort();
    }
    updateStatus.mutate(
      { id: session.id, data: { status: next } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: detailKey });
          qc.invalidateQueries({ queryKey: getListStudyGroupSessionsQueryKey() });
        },
      },
    );
  }

  async function handleInterject() {
    const text = interjection.trim();
    if (!text || streaming) return;
    setInterjection("");
    await consumeSseStream(`/api/study-group/sessions/${session.id}/interject`, { content: text });
  }

  function handlePromote(a: StudyGroupArtifact) {
    setPromotingId(a.id);
    promote.mutate(
      { id: a.id },
      {
        onSuccess: (result) => {
          toast({
            title: result.kind === "flashcard" ? "Saved to flashcards" : "Added to question bank",
            description: `Tagged as "from study group" — refid #${result.id}.`,
          });
          qc.invalidateQueries({ queryKey: detailKey });
          qc.invalidateQueries({ queryKey: getGetStudyGroupLearningSignalQueryKey() });
        },
        onError: (err: any) => {
          toast({
            title: "Promote failed",
            description: err?.message ?? "Could not promote candidate.",
            variant: "destructive",
          });
        },
        onSettled: () => setPromotingId(null),
      },
    );
  }

  const artifacts = (detail?.artifacts ?? []) as StudyGroupArtifact[];
  const isPaused = session.status === "paused";

  // Audio read-out playlist: eligible messages in transcript order, each
  // tagged with its persona's voice. System rows and empty/pending bubbles
  // are skipped.
  const speech = useSpeech();
  const playlistItems = useMemo(
    () =>
      merged
        .filter(
          (m) =>
            m.speaker !== "system" &&
            !m.__pending &&
            (m.content ?? "").trim().length > 0,
        )
        .map((m) => ({
          id: `sg-msg-${m.id}`,
          text: m.content,
          voice: speakerStyle(m.speaker).voice,
        })),
    [merged],
  );
  // Track which playlist *we* started so the toolbar/highlight stay accurate
  // even when new bubbles append while audio is mid-stream (the global
  // playlist snapshot doesn't grow).
  const ownedPlaylistIdRef = useRef<number | null>(null);
  const isOurPlaylistActive =
    speech.playlist != null &&
    speech.playlist.playlistId === ownedPlaylistIdRef.current;
  if (speech.playlist == null && ownedPlaylistIdRef.current != null) {
    ownedPlaylistIdRef.current = null;
  }
  const currentPlayingId = isOurPlaylistActive
    ? speech.playlist!.items[speech.playlist!.index]?.id ?? null
    : null;
  const playlistPaused = isOurPlaylistActive && speech.playlist!.paused;
  const playlistPlaying = isOurPlaylistActive && !speech.playlist!.paused;
  const playlistSnapshotTotal = isOurPlaylistActive
    ? speech.playlist!.items.length
    : 0;
  const playlistPosition = isOurPlaylistActive ? speech.playlist!.index + 1 : 0;
  const playlistTotal = playlistItems.length;
  const currentPlayingSpeaker = isOurPlaylistActive
    ? merged.find((m) => `sg-msg-${m.id}` === currentPlayingId)?.speaker ?? null
    : null;

  async function handleStartListen() {
    if (playlistItems.length === 0) return;
    await speech.playPlaylist(playlistItems);
    // playPlaylist mutates the singleton synchronously before awaiting, so
    // the latest playlistId is already available on the next render. We
    // capture it here from the singleton state via a follow-up read.
    // Note: speech.playlist reflects the current render snapshot; read the
    // freshly-bumped id by re-reading the hook in a microtask.
    queueMicrotask(() => {
      // useSpeech's notify() will trigger a re-render with the new playlist.
      // We snag the id from a one-shot read by leveraging the same module
      // singleton via the hook's next render — but since we don't have a
      // direct accessor here, we mark ownership using the next non-null
      // playlistId we see (handled by the effect below).
    });
  }
  // Claim ownership of the most recently created playlist when we don't yet
  // have one and the singleton has a fresh playlist that wasn't there before.
  // This covers the (synchronous) gap between calling playPlaylist and the
  // re-render that delivers the new playlist state.
  useEffect(() => {
    if (
      speech.playlist != null &&
      ownedPlaylistIdRef.current == null &&
      // Heuristic: only auto-claim if the playlist's items match what we'd
      // have queued (same ids in same order). Avoids stealing another panel's
      // playlist.
      speech.playlist.items.length > 0 &&
      speech.playlist.items.every(
        (it, i) => playlistItems[i]?.id === it.id,
      ) &&
      speech.playlist.items.length === playlistItems.length
    ) {
      ownedPlaylistIdRef.current = speech.playlist.playlistId;
    }
  }, [speech.playlist, playlistItems]);

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Users className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sm truncate" data-testid="sg-session-title">
            {session.title}
          </div>
          <div className="text-xs text-muted-foreground">
            Round {session.roundCount} · {session.status}
            {session.focus ? ` · focus: ${session.focus}` : ""}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handlePauseResume}
          disabled={updateStatus.isPending}
          data-testid="button-sg-pause-resume"
        >
          {isPaused ? <Play className="h-3.5 w-3.5 mr-1" /> : <Pause className="h-3.5 w-3.5 mr-1" />}
          {isPaused ? "Resume" : "Pause"}
        </Button>
        {hasFailed && canResume && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleStartRound({ retry: true })}
            disabled={streaming || isPaused}
            data-testid="button-sg-retry-round"
            title={`Retry the failed turns in round ${incompleteRound}`}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1" />
            Retry last round
          </Button>
        )}
        <Button
          size="sm"
          onClick={() => handleStartRound()}
          disabled={streaming || isPaused}
          data-testid="button-sg-start-round"
        >
          {streaming ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : canResume ? (
            <Play className="h-3.5 w-3.5 mr-1" />
          ) : (
            <Wand2 className="h-3.5 w-3.5 mr-1" />
          )}
          {canResume ? `Resume round ${incompleteRound}` : "Start round"}
        </Button>
      </div>

      {/* Audio read-out toolbar */}
      {speech.supported && playlistTotal > 0 && (
        <div className="border-b bg-muted/40 px-4 py-1.5 flex items-center gap-2 text-xs">
          <Headphones className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          {!isOurPlaylistActive ? (
            <>
              <span className="text-muted-foreground">
                Read this conversation aloud — each persona uses their own voice.
              </span>
              <div className="flex-1" />
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => void handleStartListen()}
                data-testid="button-sg-listen-all"
              >
                <Play className="h-3.5 w-3.5 mr-1" />
                Listen ({playlistTotal})
              </Button>
            </>
          ) : (
            <>
              <span className="font-medium" data-testid="sg-playlist-position">
                {playlistPosition} / {playlistSnapshotTotal}
              </span>
              {currentPlayingSpeaker && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                  {speakerStyle(currentPlayingSpeaker).label}
                </Badge>
              )}
              <div className="flex-1" />
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => speech.prevPlaylist()}
                disabled={speech.playlist!.index <= 0}
                title="Previous"
                data-testid="button-sg-playlist-prev"
              >
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
              {playlistPaused ? (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-primary"
                  onClick={() => speech.resumePlaylist()}
                  title="Resume"
                  data-testid="button-sg-playlist-resume"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-primary"
                  onClick={() => speech.pausePlaylist()}
                  title="Pause"
                  data-testid="button-sg-playlist-pause"
                >
                  <Pause className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => speech.nextPlaylist()}
                disabled={speech.playlist!.index >= playlistSnapshotTotal - 1}
                title="Next"
                data-testid="button-sg-playlist-next"
              >
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => speech.stopPlaylist()}
                title="Stop"
                data-testid="button-sg-playlist-stop"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      )}

      {/* Transcript */}
      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {merged.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Click "Start round" — Dr. Mentor will pose the first question and the group will work through it.
          </p>
        )}
        {merged.map((m) => (
          <MessageBubble
            key={`${m.id}-${m.kind}`}
            message={m}
            highlighted={focusRound != null && m.roundIndex === focusRound.round}
            isPlaying={
              (playlistPlaying || playlistPaused) &&
              currentPlayingId === `sg-msg-${m.id}`
            }
          />
        ))}
        {streaming && (
          <div className="text-xs text-muted-foreground italic flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> The group is talking…
          </div>
        )}
      </div>

      {/* Footer interjection input */}
      <div className="border-t px-3 py-2 flex items-end gap-2">
        <Textarea
          value={interjection}
          onChange={(e) => setInterjection(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              handleInterject();
            }
          }}
          rows={2}
          placeholder="Ask the group… (Cmd/Ctrl+Enter)"
          disabled={streaming || isPaused}
          className="min-h-[40px] resize-none text-sm"
          data-testid="input-sg-interject"
        />
        <Button
          onClick={handleInterject}
          disabled={!interjection.trim() || streaming || isPaused}
          data-testid="button-sg-interject"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Artifacts strip */}
      {artifacts.length > 0 && (
        <div className="border-t px-3 py-2 max-h-48 overflow-y-auto">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1.5">
            From this group ({artifacts.length})
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {artifacts.map((a) => (
              <ArtifactCard
                key={a.id}
                artifact={a}
                onPromote={handlePromote}
                promoting={promotingId === a.id}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NewSessionDialog({
  open,
  onOpenChange,
  onCreated,
  defaultTopicId,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  onCreated: (s: StudyGroupSession) => void;
  defaultTopicId?: number;
}) {
  const { data: domains = [] } = useListDomains();
  const [domainId, setDomainId] = useState<string>("any");
  const { data: topics = [] } = useListTopics(
    domainId !== "any" ? { domainId: Number(domainId) } : {},
  );
  const [topicId, setTopicId] = useState<string>(defaultTopicId ? String(defaultTopicId) : "auto");
  const [focus, setFocus] = useState("");
  const create = useCreateStudyGroupSession();
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (defaultTopicId) setTopicId(String(defaultTopicId));
  }, [defaultTopicId, open]);

  function submit() {
    const data: { topicId?: number; focus?: string } = {};
    if (topicId !== "auto") data.topicId = Number(topicId);
    if (focus.trim()) data.focus = focus.trim();
    create.mutate(
      { data },
      {
        onSuccess: (sess) => {
          toast({ title: "Study group opened", description: sess.title });
          onCreated(sess);
          onOpenChange(false);
          setFocus("");
          qc.invalidateQueries({ queryKey: getListStudyGroupSessionsQueryKey() });
        },
        onError: (err: any) =>
          toast({
            title: "Could not open group",
            description: err?.message ?? "",
            variant: "destructive",
          }),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New study group session</DialogTitle>
          <DialogDescription>
            Pick a topic (or let us pick your weakest one) and add an optional focus prompt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium">Domain</label>
            <Select value={domainId} onValueChange={(v) => { setDomainId(v); setTopicId("auto"); }}>
              <SelectTrigger className="h-9 mt-1" data-testid="sg-domain-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any domain</SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Topic</label>
            <Select value={topicId} onValueChange={setTopicId}>
              <SelectTrigger className="h-9 mt-1" data-testid="sg-topic-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="auto">Auto — my weakest topic</SelectItem>
                {topics.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium">Focus (optional)</label>
            <Input
              value={focus}
              onChange={(e) => setFocus(e.target.value)}
              placeholder="e.g. RTP criteria after concussion, distinguishing exertional vs non-exertional…"
              className="mt-1"
              data-testid="sg-focus-input"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={create.isPending} data-testid="button-sg-create">
            {create.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            Open study group
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function StudyGroupPage() {
  const { setOpen: setChatOpen } = useChatStore();
  useEffect(() => {
    setChatOpen(false);
  }, [setChatOpen]);

  const search = useSearch();
  const [, navigate] = useLocation();
  const { data: sessions = [], isLoading } = useListStudyGroupSessions();
  const { data: signal } = useGetStudyGroupLearningSignal();
  const { data: summary } = useGetDashboardSummary();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [defaultTopicId, setDefaultTopicId] = useState<number | undefined>();
  const [tab, setTab] = useState<"sessions" | "library">("sessions");
  // Round to highlight when arriving via a deep-link from the Library tab.
  // Bumped on each navigation so the SessionPanel re-scrolls even if the same
  // round was already targeted.
  const [focusRound, setFocusRound] = useState<{ round: number; nonce: number } | null>(null);

  // Auto-open the new-session dialog if a ?topicId= is supplied (deep link
  // from QuizRunner / Dashboard). Also handle ?session=<id> deep links from
  // the Library tab to switch to Sessions and select that round.
  useEffect(() => {
    const params = new URLSearchParams(search);
    const tid = params.get("topicId");
    if (tid) {
      const n = Number(tid);
      if (!Number.isNaN(n) && n > 0) {
        setDefaultTopicId(n);
        setNewOpen(true);
      }
    }
    const sid = params.get("session");
    if (sid) {
      const n = Number(sid);
      if (!Number.isNaN(n) && n > 0) {
        setActiveId(n);
        setTab("sessions");
      }
    }
    const round = params.get("round");
    if (round) {
      const r = Number(round);
      if (!Number.isNaN(r) && r >= 0) {
        setFocusRound({ round: r, nonce: Date.now() });
      }
    }
    if (params.get("tab") === "library") setTab("library");
  }, [search]);
  const del = useDeleteStudyGroupSession();
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (activeId == null && sessions.length > 0) setActiveId(sessions[0].id);
  }, [sessions, activeId]);

  const activeSession = sessions.find((s) => s.id === activeId) ?? null;
  const weakest = summary?.weakTopics?.[0];

  function deleteSession(id: number) {
    if (!confirm("Delete this study group session and its transcript?")) return;
    del.mutate(
      { id },
      {
        onSuccess: () => {
          if (activeId === id) setActiveId(null);
          qc.invalidateQueries({ queryKey: getListStudyGroupSessionsQueryKey() });
          toast({ title: "Session deleted" });
        },
      },
    );
  }

  return (
    <div className="h-screen flex flex-col" data-testid="page-study-group">
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Users className="h-5 w-5 text-primary" />
        <div className="flex-1 min-w-0">
          <h1 className="text-lg font-semibold leading-tight">AI Study Group</h1>
          <p className="text-xs text-muted-foreground">
            Sit in on a 4-way BOC study session. Save anything useful straight into your flashcards or question bank.
          </p>
        </div>
        <Button
          onClick={() => {
            setDefaultTopicId(weakest?.topicId);
            setNewOpen(true);
          }}
          data-testid="button-new-study-group"
        >
          <Plus className="h-4 w-4 mr-1" />
          New session
        </Button>
      </div>
      <Tabs value={tab} onValueChange={(v) => setTab(v as "sessions" | "library")} className="flex-1 min-h-0 flex flex-col">
        <div className="border-b px-4">
          <TabsList className="h-9">
            <TabsTrigger value="sessions" data-testid="tab-sessions">
              <Users className="h-3.5 w-3.5 mr-1.5" /> Sessions
            </TabsTrigger>
            <TabsTrigger value="library" data-testid="tab-library">
              <LibraryIcon className="h-3.5 w-3.5 mr-1.5" /> Library
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="sessions" className="flex-1 min-h-0 m-0">
      <div className="h-full grid grid-cols-[14rem_1fr_18rem]">
        {/* Sessions list */}
        <aside className="border-r overflow-y-auto p-2 space-y-1">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground px-2 pt-1 pb-1">
            Sessions
          </div>
          {isLoading && <p className="text-xs text-muted-foreground px-2">Loading…</p>}
          {!isLoading && sessions.length === 0 && (
            <p className="text-xs text-muted-foreground px-2">
              No sessions yet. Click "New session" to start one.
            </p>
          )}
          {sessions.map((s) => (
            <div
              key={s.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-2 py-1.5 cursor-pointer text-sm",
                activeId === s.id ? "bg-primary/10" : "hover:bg-accent",
              )}
              onClick={() => setActiveId(s.id)}
              data-testid={`sg-session-${s.id}`}
            >
              <div className="flex-1 min-w-0">
                <div className="truncate text-[13px] font-medium">{s.title}</div>
                <div className="text-[11px] text-muted-foreground">
                  R{s.roundCount} · {s.status}
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={(e) => { e.stopPropagation(); deleteSession(s.id); }}
                data-testid={`sg-delete-${s.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </aside>

        {/* Active session */}
        <section className="min-w-0 flex flex-col h-full">
          {activeSession ? (
            <SessionPanel session={activeSession} key={activeSession.id} focusRound={focusRound} />
          ) : (
            <div className="flex-1 grid place-items-center text-center p-8">
              <div className="max-w-md space-y-3">
                <Users className="h-10 w-10 text-muted-foreground mx-auto" />
                <h2 className="text-lg font-semibold">Open your first study group</h2>
                <p className="text-sm text-muted-foreground">
                  Dr. Mentor (graduate professor), Alex (BOC-certified peer), and Jordan (BOC-certified
                  peer with 4 years in clinic) will work a high-yield BOC question with you. You can interject any time.
                </p>
                <Button onClick={() => setNewOpen(true)} data-testid="button-new-study-group-empty">
                  <Plus className="h-4 w-4 mr-1" /> New session
                </Button>
              </div>
            </div>
          )}
        </section>

        {/* Learning signal panel */}
        <aside className="border-l overflow-y-auto p-3 space-y-3">
          <div>
            <h3 className="text-sm font-semibold">Learning signal</h3>
            <p className="text-[11px] text-muted-foreground">
              What the group has taught your study system so far.
            </p>
          </div>
          <Card>
            <CardContent className="p-3 space-y-2 text-xs" data-testid="learning-signal-card">
              <p className="text-[12px]">{signal?.summary ?? "No sessions yet."}</p>
              <div className="grid grid-cols-2 gap-2 pt-1">
                <Stat label="Sessions" value={signal?.sessions} />
                <Stat label="Reasoning patterns" value={signal?.reasoningPatterns} />
                <Stat
                  label="Flashcards"
                  value={`${signal?.flashcardsPromoted ?? 0}/${signal?.flashcardCandidates ?? 0}`}
                  caption="promoted / candidates"
                />
                <Stat
                  label="Questions"
                  value={`${signal?.questionsPromoted ?? 0}/${signal?.questionCandidates ?? 0}`}
                  caption="promoted / candidates"
                />
              </div>
            </CardContent>
          </Card>
          {signal && signal.recentSignalNotes.length > 0 && (
            <Card>
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-xs">Recent mastery notes</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0 space-y-1.5">
                {signal.recentSignalNotes.map((n, i) => (
                  <div key={i} className="text-[11px]">
                    {n.topic && (
                      <Badge variant="outline" className="mr-1 px-1 py-0 h-4 text-[10px]">
                        {n.topic}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">{n.note}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
        </TabsContent>
        <TabsContent value="library" className="flex-1 min-h-0 m-0 overflow-y-auto">
          <LibraryTab
            onOpenSession={(id, roundIndex) => {
              setActiveId(id);
              setTab("sessions");
              setFocusRound({ round: roundIndex, nonce: Date.now() });
              navigate(`/study-group?session=${id}&round=${roundIndex}`);
            }}
          />
        </TabsContent>
      </Tabs>

      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultTopicId={defaultTopicId}
        onCreated={(s) => setActiveId(s.id)}
      />
    </div>
  );
}

function LibraryTab({ onOpenSession }: { onOpenSession: (sessionId: number, roundIndex: number) => void }) {
  const [pendingOnly, setPendingOnly] = useState(false);
  const params = pendingOnly ? { pendingReview: true } : undefined;
  const { data, isLoading } = useGetStudyGroupLibrary(params);
  const flashcards = data?.flashcards ?? [];
  const questions = data?.questions ?? [];
  const pendingCount = data?.pendingReviewCount ?? 0;

  return (
    <div className="p-4 space-y-4 max-w-5xl mx-auto" data-testid="study-group-library">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <LibraryIcon className="h-4 w-4" /> Study group library
          </h2>
          <p className="text-xs text-muted-foreground">
            Everything promoted to your flashcards and question bank from a study-group session.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Badge
              variant="outline"
              className="text-[11px] gap-1 border-amber-300 text-amber-700 dark:text-amber-300"
              data-testid="badge-pending-review-count"
            >
              <AlertTriangle className="h-3 w-3" />
              {pendingCount} pending review
            </Badge>
          )}
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={pendingOnly}
              onCheckedChange={setPendingOnly}
              data-testid="toggle-pending-review"
            />
            Only pending review
          </label>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading library…</p>}

      {!isLoading && flashcards.length === 0 && questions.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center space-y-2">
            <LibraryIcon className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-sm font-medium">No saved items yet</p>
            <p className="text-xs text-muted-foreground">
              When you promote a candidate flashcard or question from a study group session, it lands here.
            </p>
          </CardContent>
        </Card>
      )}

      {flashcards.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <BookOpen className="h-3.5 w-3.5" /> Flashcards ({flashcards.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {flashcards.map((f) => (
              <Card key={`f-${f.artifactId}`} data-testid={`library-flashcard-${f.flashcardId}`}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground truncate">
                      {f.sessionTitle} · R{f.roundIndex}
                      {f.topicName ? ` · ${f.topicName}` : ""}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      onClick={() => onOpenSession(f.sessionId, f.roundIndex)}
                      data-testid={`library-open-session-flashcard-${f.flashcardId}`}
                    >
                      View round <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                  <p className="text-sm font-medium">{f.front}</p>
                  <p className="text-xs text-muted-foreground line-clamp-3">{f.back}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {questions.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <FileQuestion className="h-3.5 w-3.5" /> Questions ({questions.length})
          </h3>
          <div className="space-y-2">
            {questions.map((q) => (
              <Card key={`q-${q.artifactId}`} data-testid={`library-question-${q.questionId}`}>
                <CardContent className="p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                      <span>
                        {q.sessionTitle} · R{q.roundIndex}
                        {q.topicName ? ` · ${q.topicName}` : ""}
                      </span>
                      {q.pendingReview && (
                        <Badge
                          variant="outline"
                          className="h-4 px-1 text-[10px] border-amber-300 text-amber-700 dark:text-amber-300 gap-1"
                          data-testid={`library-question-pending-${q.questionId}`}
                        >
                          <AlertTriangle className="h-2.5 w-2.5" /> pending review
                        </Badge>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-1.5 text-[11px]"
                      onClick={() => onOpenSession(q.sessionId, q.roundIndex)}
                      data-testid={`library-open-session-question-${q.questionId}`}
                    >
                      View round <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                  <p className="text-sm font-medium">{q.stem}</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {q.choices.map((c, i) => (
                      <li
                        key={i}
                        className={
                          i === q.correctIndex
                            ? "text-emerald-600 dark:text-emerald-400 font-medium"
                            : ""
                        }
                      >
                        {String.fromCharCode(65 + i)}. {c}
                      </li>
                    ))}
                  </ul>
                  {q.rationale && (
                    <p className="text-[11px] text-muted-foreground italic">{q.rationale}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  caption,
}: {
  label: string;
  value: number | string | undefined;
  caption?: string;
}) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value ?? 0}</div>
      {caption && <div className="text-[10px] text-muted-foreground">{caption}</div>}
    </div>
  );
}
