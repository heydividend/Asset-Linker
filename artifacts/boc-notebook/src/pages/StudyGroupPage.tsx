import { useEffect, useMemo, useRef, useState } from "react";
import { useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListStudyGroupSessions,
  useGetStudyGroupSession,
  useCreateStudyGroupSession,
  useUpdateStudyGroupSession,
  useDeleteStudyGroupSession,
  usePromoteStudyGroupArtifact,
  useGetStudyGroupLearningSignal,
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
import {
  GraduationCap,
  Loader2,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  Trash2,
  Users,
  Wand2,
  Stethoscope,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type TempMessage = StudyGroupMessage & { __pending?: boolean };

interface SpeakerStyle {
  initials: string;
  label: string;
  badge: string;
  ring: string;
  icon: typeof GraduationCap;
}

const SPEAKERS: Record<string, SpeakerStyle> = {
  mentor: {
    initials: "DM",
    label: "Dr. Mentor",
    badge: "Graduate Professor",
    ring: "bg-amber-500 text-white",
    icon: GraduationCap,
  },
  alex: {
    initials: "A",
    label: "Alex",
    badge: "BOC-certified peer",
    ring: "bg-sky-500 text-white",
    icon: Sparkles,
  },
  jordan: {
    initials: "J",
    label: "Jordan",
    badge: "BOC-certified peer · 4 yrs clinic",
    ring: "bg-emerald-500 text-white",
    icon: Stethoscope,
  },
  student: {
    initials: "You",
    label: "You",
    badge: "Student",
    ring: "bg-primary text-primary-foreground",
    icon: Users,
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

function MessageBubble({ message }: { message: TempMessage }) {
  const style = speakerStyle(message.speaker);
  const kindLabel = KIND_LABELS[message.kind] ?? message.kind;
  const isStudent = message.speaker === "student";
  const isSystem = message.speaker === "system";
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
      className={cn("flex gap-3 items-start", isStudent && "flex-row-reverse")}
      data-testid={`sg-msg-${message.id}`}
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
        </div>
        <div
          className={cn(
            "rounded-lg px-3 py-2 border bg-card text-card-foreground",
            isStudent && "bg-primary/5 border-primary/30",
            message.kind === "verdict" && "bg-amber-50 dark:bg-amber-950/30 border-amber-300/60",
            message.kind === "takeaway" && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300/60",
            message.__pending && "opacity-90",
          )}
        >
          <MarkdownMessage content={message.content || (message.__pending ? "_typing…_" : "")} />
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
}

function SessionPanel({ session }: SessionPanelProps) {
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
    const persisted = (detail?.messages ?? []) as TempMessage[];
    const persistedIds = new Set(persisted.map((m) => m.id));
    return [
      ...persisted,
      ...pendingMessages.filter((m) => !persistedIds.has(m.id)),
    ];
  }, [detail, pendingMessages]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [merged.length, pendingMessages]);

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
            pendingId -= 1;
            current = {
              id: pendingId,
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

  async function handleStartRound() {
    await consumeSseStream(`/api/study-group/sessions/${session.id}/round`, {});
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
        <Button
          size="sm"
          onClick={handleStartRound}
          disabled={streaming || isPaused}
          data-testid="button-sg-start-round"
        >
          {streaming ? (
            <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          ) : (
            <Wand2 className="h-3.5 w-3.5 mr-1" />
          )}
          Start round
        </Button>
      </div>

      {/* Transcript */}
      <div ref={transcriptRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {merged.length === 0 && (
          <p className="text-sm text-muted-foreground italic">
            Click "Start round" — Dr. Mentor will pose the first question and the group will work through it.
          </p>
        )}
        {merged.map((m) => (
          <MessageBubble key={`${m.id}-${m.kind}`} message={m} />
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
  const { data: sessions = [], isLoading } = useListStudyGroupSessions();
  const { data: signal } = useGetStudyGroupLearningSignal();
  const { data: summary } = useGetDashboardSummary();
  const [activeId, setActiveId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [defaultTopicId, setDefaultTopicId] = useState<number | undefined>();

  // Auto-open the new-session dialog if a ?topicId= is supplied (deep link
  // from QuizRunner / Dashboard).
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
      <div className="flex-1 min-h-0 grid grid-cols-[14rem_1fr_18rem]">
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
            <SessionPanel session={activeSession} key={activeSession.id} />
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

      <NewSessionDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        defaultTopicId={defaultTopicId}
        onCreated={(s) => setActiveId(s.id)}
      />
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
