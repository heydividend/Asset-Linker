import { useEffect, useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import {
  useGetNotebook,
  useCreateNote,
  useDeleteNote,
  useGenerateStudyGuide,
  useDeleteStudyGuide,
  useGenerateAudioOverview,
  useGetAudioOverview,
  useStartQuiz,
  getGetNotebookQueryKey,
  getGetAudioOverviewQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AskAiButton } from "@/components/AskAiButton";
import { ListenAsPodcastButton, PodcastList } from "@/components/PodcastPlayer";
import { useToast } from "@/hooks/use-toast";
import { Bot, FileText, Headphones, Plus, Trash2, BookOpen, Sparkles, Brain, Loader2, ChevronLeft, PanelLeftOpen, RotateCw } from "lucide-react";
import { MarkdownMessage } from "@/components/MarkdownMessage";

export default function NotebookDetail() {
  const params = useParams();
  const id = Number(params.id);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data: notebook, isLoading } = useGetNotebook(id, { query: { enabled: !!id, queryKey: getGetNotebookQueryKey(id) } });
  const createNote = useCreateNote();
  const deleteNote = useDeleteNote();
  const genGuide = useGenerateStudyGuide();
  const deleteGuide = useDeleteStudyGuide();
  const genAudio = useGenerateAudioOverview();
  const startQuiz = useStartQuiz();

  const search = useSearch();
  const requestedNoteId = (() => {
    const v = new URLSearchParams(search).get("note");
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  })();
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(requestedNoteId);
  useEffect(() => {
    if (requestedNoteId != null) setSelectedNoteId(requestedNoteId);
  }, [requestedNoteId]);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteForm, setNoteForm] = useState({ title: "", content: "", sourceKind: "text" as "text" | "paste" | "url", sourceUrl: "" });
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideForm, setGuideForm] = useState({ format: "outline" as "outline" | "summary" | "qa" | "mindmap", focus: "" });
  const [audioOpen, setAudioOpen] = useState(false);
  const [audioForm, setAudioForm] = useState({ voice: "echo" as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer", focus: "" });
  const [sourcesCollapsed, setSourcesCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("boc:notebook-sources-collapsed") === "1";
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("boc:notebook-sources-collapsed", sourcesCollapsed ? "1" : "0");
  }, [sourcesCollapsed]);

  if (isLoading) return <div className="p-6">Loading notebook…</div>;
  if (!notebook) return <div className="p-6">Notebook not found.</div>;

  const selectedNote = notebook.notes?.find((n) => n.id === selectedNoteId) ?? notebook.notes?.[0];

  const invalidate = () => qc.invalidateQueries({ queryKey: getGetNotebookQueryKey(id) });

  const onCreateNote = () => {
    const data: { title: string; content: string; sourceKind: "text" | "paste" | "url"; sourceUrl?: string } = {
      title: noteForm.title || "Untitled",
      content: noteForm.content,
      sourceKind: noteForm.sourceKind,
    };
    if (noteForm.sourceKind === "url" && noteForm.sourceUrl) data.sourceUrl = noteForm.sourceUrl;
    createNote.mutate({ id, data }, {
      onSuccess: () => {
        setNoteOpen(false);
        setNoteForm({ title: "", content: "", sourceKind: "text", sourceUrl: "" });
        invalidate();
      },
    });
  };

  const onGenerateGuide = () => {
    genGuide.mutate({ id, data: { format: guideForm.format, focus: guideForm.focus || undefined } }, {
      onSuccess: () => {
        setGuideOpen(false);
        invalidate();
        toast({ title: "Study guide generated" });
      },
    });
  };

  const onGenerateAudio = () => {
    genAudio.mutate({ id, data: { voice: audioForm.voice, style: "podcast", focus: audioForm.focus || undefined } }, {
      onSuccess: () => {
        setAudioOpen(false);
        invalidate();
        toast({ title: "Podcast queued", description: "It will be ready in a few seconds." });
      },
    });
  };

  const onStartQuiz = () => {
    startQuiz.mutate({ data: { mode: "topic", count: 10, notebookId: id } }, {
      onSuccess: (q) => navigate(`/quiz/${q.id}`),
    });
  };


  return (
    <div className="flex h-full">
      {/* LEFT: Sources */}
      {!sourcesCollapsed && (
      <aside className="w-80 border-r bg-sidebar flex flex-col" data-tour="notebook-sources">
        <div className="h-14 border-b flex items-center justify-between px-3 gap-1">
          <span className="font-semibold text-sm flex items-center gap-2 min-w-0"><BookOpen className="h-4 w-4 shrink-0" /> <span className="truncate">Sources</span></span>
          <div className="flex items-center gap-1 shrink-0">
          <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
            <DialogTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7" data-testid="button-add-note" title="Add a source">
                <Plus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add a source</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Title" value={noteForm.title} onChange={(e) => setNoteForm({ ...noteForm, title: e.target.value })} data-testid="input-note-title" />
                <Select value={noteForm.sourceKind} onValueChange={(v) => setNoteForm({ ...noteForm, sourceKind: v as typeof noteForm.sourceKind })}>
                  <SelectTrigger data-testid="select-note-kind"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Typed text</SelectItem>
                    <SelectItem value="paste">Pasted material</SelectItem>
                    <SelectItem value="url">From URL</SelectItem>
                  </SelectContent>
                </Select>
                {noteForm.sourceKind === "url" && (
                  <Input placeholder="https://…" value={noteForm.sourceUrl} onChange={(e) => setNoteForm({ ...noteForm, sourceUrl: e.target.value })} data-testid="input-note-url" />
                )}
                <Textarea placeholder="Content" rows={10} value={noteForm.content} onChange={(e) => setNoteForm({ ...noteForm, content: e.target.value })} data-testid="input-note-content" />
                <DialogFooter>
                  <Button onClick={onCreateNote} disabled={createNote.isPending} data-testid="button-save-note">Add source</Button>
                </DialogFooter>
              </div>
            </DialogContent>
          </Dialog>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => setSourcesCollapsed(true)}
            data-testid="button-collapse-sources"
            title="Hide sources"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          </div>
        </div>
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-1">
            {(notebook.notes ?? []).length === 0 && (
              <p className="text-xs text-muted-foreground p-3">No sources yet. Add notes, paste material, or upload a PDF via the AI Tutor chat.</p>
            )}
            {(notebook.notes ?? []).map((n) => (
              <div key={n.id} className={`group flex items-center gap-1 rounded-md ${selectedNote?.id === n.id ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/50"}`}>
                <button
                  onClick={() => setSelectedNoteId(n.id)}
                  className="flex-1 text-left px-2 py-2 text-sm break-words leading-snug"
                  data-testid={`note-item-${n.id}`}
                  title={n.title}
                >
                  <FileText className="h-3 w-3 inline mr-1 shrink-0" />{n.title}
                </button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100 shrink-0"
                      data-testid={`button-delete-note-${n.id}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete this note?</AlertDialogTitle>
                      <AlertDialogDescription>
                        "{n.title}" will be permanently removed from this notebook. This can't be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel data-testid={`button-cancel-delete-note-${n.id}`}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() =>
                          deleteNote.mutate(
                            { id: n.id },
                            {
                              onSuccess: () => {
                                invalidate();
                                if (selectedNoteId === n.id) setSelectedNoteId(null);
                                toast({ title: "Note deleted" });
                              },
                              onError: (err) =>
                                toast({
                                  title: "Couldn't delete note",
                                  description: err instanceof Error ? err.message : "Try again in a moment.",
                                  variant: "destructive",
                                }),
                            },
                          )
                        }
                        data-testid={`button-confirm-delete-note-${n.id}`}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </ScrollArea>
      </aside>
      )}

      {/* CENTER: Workspace */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        <header className="h-14 border-b flex items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2 min-w-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-8 shrink-0"
              onClick={() => navigate("/notebooks")}
              data-testid="button-back-to-notebooks"
              title="Back to all notebooks"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Notebooks
            </Button>
            {sourcesCollapsed && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 shrink-0"
                onClick={() => setSourcesCollapsed(false)}
                data-testid="button-show-sources"
                title="Show sources"
              >
                <PanelLeftOpen className="h-4 w-4 mr-1.5" /> Sources
              </Button>
            )}
            <div className="min-w-0">
              <h1 className="font-semibold truncate" data-testid="text-notebook-title">{notebook.title}</h1>
              {notebook.description && <p className="text-xs text-muted-foreground truncate">{notebook.description}</p>}
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onStartQuiz} disabled={startQuiz.isPending} data-testid="button-quiz-from-notebook" className="shrink-0">
            <Brain className="h-4 w-4 mr-1" /> Quiz from this notebook
          </Button>
        </header>

        <Tabs defaultValue="notes" className="flex-1 flex flex-col overflow-hidden">
          <TabsList className="mx-4 mt-2 self-start" data-tour="notebook-tabs">
            <TabsTrigger value="notes" data-testid="tab-notes">Notes</TabsTrigger>
            <TabsTrigger value="guides" data-testid="tab-guides">Study guides ({notebook.studyGuides?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="audio" data-testid="tab-audio">Podcasts ({notebook.audioOverviews?.length ?? 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="notes" className="flex-1 overflow-y-auto p-6">
            {selectedNote ? (
              <article className="max-w-3xl mx-auto space-y-3">
                <div className="flex items-start justify-between">
                  <h2 className="text-2xl font-semibold">{selectedNote.title}</h2>
                  <AskAiButton
                    notebookId={id}
                    context={`Help me study this note from my notebook "${notebook.title}":\n\nTitle: ${selectedNote.title}\n\n${selectedNote.content.slice(0, 4000)}`}
                  />
                </div>
                {selectedNote.sourceUrl && (
                  <a href={selectedNote.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{selectedNote.sourceUrl}</a>
                )}
                <MarkdownMessage content={selectedNote.content} className="prose-base" />
              </article>
            ) : (
              <p className="text-muted-foreground text-center py-8">Add or select a note to view it.</p>
            )}
          </TabsContent>

          <TabsContent value="guides" className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-4">
              <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-generate-guide"><Sparkles className="h-4 w-4 mr-1" /> Generate study guide</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Generate a study guide</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <Select value={guideForm.format} onValueChange={(v) => setGuideForm({ ...guideForm, format: v as typeof guideForm.format })}>
                      <SelectTrigger data-testid="select-guide-format"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outline">Outline</SelectItem>
                        <SelectItem value="summary">Summary</SelectItem>
                        <SelectItem value="qa">Q&amp;A</SelectItem>
                        <SelectItem value="mindmap">Mind-map</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input placeholder="Focus (optional)" value={guideForm.focus} onChange={(e) => setGuideForm({ ...guideForm, focus: e.target.value })} data-testid="input-guide-focus" />
                    <Button onClick={onGenerateGuide} disabled={genGuide.isPending} data-testid="button-confirm-generate-guide">
                      {genGuide.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Generate
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {(notebook.studyGuides ?? []).map((g) => (
                <Card key={g.id} data-testid={`card-guide-${g.id}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{g.title}</h3>
                        <Badge variant="outline">{g.format}</Badge>
                      </div>
                      <div className="flex gap-1 items-center">
                        <ListenAsPodcastButton studyGuideId={g.id} />
                        <AskAiButton notebookId={id} context={`Quiz me on this study guide:\n\n${g.content.slice(0, 4000)}`} size="sm" />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-delete-guide-${g.id}`}>
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete this study guide?</AlertDialogTitle>
                              <AlertDialogDescription>
                                "{g.title}" and any podcasts generated from it will be permanently removed. This can't be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel data-testid={`button-cancel-delete-guide-${g.id}`}>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  deleteGuide.mutate(
                                    { id: g.id },
                                    {
                                      onSuccess: () => {
                                        invalidate();
                                        toast({ title: "Study guide deleted" });
                                      },
                                      onError: (err) =>
                                        toast({
                                          title: "Couldn't delete study guide",
                                          description: err instanceof Error ? err.message : "Try again in a moment.",
                                          variant: "destructive",
                                        }),
                                    },
                                  )
                                }
                                data-testid={`button-confirm-delete-guide-${g.id}`}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                    <div className="max-w-none">
                      <MarkdownMessage content={g.content} />
                    </div>
                    <div className="border-t pt-2">
                      <PodcastList studyGuideId={g.id} />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="audio" className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-3">
              <Dialog open={audioOpen} onOpenChange={setAudioOpen}>
                <DialogTrigger asChild>
                  <Button data-testid="button-generate-audio"><Headphones className="h-4 w-4 mr-1" /> Generate podcast</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Generate a podcast from these notes</DialogTitle></DialogHeader>
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      Turns the notes in this notebook into a conversational podcast you can listen to.
                    </p>
                    <div className="space-y-1">
                      <label className="text-sm font-medium">Voice</label>
                      <Select value={audioForm.voice} onValueChange={(v) => setAudioForm({ ...audioForm, voice: v as typeof audioForm.voice })}>
                        <SelectTrigger data-testid="select-audio-voice"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["echo", "alloy", "fable", "onyx", "nova", "shimmer"].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input placeholder="Focus (optional) — e.g. concussion return-to-play" value={audioForm.focus} onChange={(e) => setAudioForm({ ...audioForm, focus: e.target.value })} data-testid="input-audio-focus" />
                    <Button onClick={onGenerateAudio} disabled={genAudio.isPending} data-testid="button-confirm-generate-audio">
                      {genAudio.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Generate podcast
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              {(notebook.audioOverviews ?? []).map((a) => (
                <AudioCard key={a.id} id={a.id} title={a.title} status={a.status} voice={a.voice} notebookId={id} initialStatus={a.status} />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function AudioCard({ id, title, status: initial, voice, notebookId, initialStatus }: { id: number; title: string; status: string; voice: string; notebookId: number; initialStatus: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const regen = useGenerateAudioOverview();
  const [audioError, setAudioError] = useState(false);
  const { data: a } = useGetAudioOverview(id, {
    query: {
      queryKey: getGetAudioOverviewQueryKey(id),
      refetchInterval: (q) => {
        const d = q.state.data as { status: string } | undefined;
        return d && d.status === "pending" ? 4000 : false;
      },
      initialData: { id, notebookId, title, status: initial as "pending" | "ready" | "failed", voice, durationSec: null, transcript: null, createdAt: new Date().toISOString() },
    },
  });
  const status = a?.status ?? initialStatus;
  const currentVoice = (a?.voice ?? voice) as "nova" | "alloy" | "echo" | "fable" | "onyx" | "shimmer";

  const onRetry = () => {
    regen.mutate(
      { id: notebookId, data: { voice: currentVoice, style: "podcast" } },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getGetNotebookQueryKey(notebookId) });
          toast({ title: "Retrying podcast generation" });
        },
        onError: (err) => {
          toast({
            title: "Couldn't retry generation",
            description: err instanceof Error ? err.message : "Try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <Card data-testid={`card-audio-${id}`}>
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Headphones className="h-4 w-4 text-primary" />
            <h3 className="font-semibold">{title}</h3>
          </div>
          <Badge variant={status === "ready" ? "default" : status === "failed" ? "destructive" : "secondary"}>
            {status === "pending" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {status === "pending" ? "Generating audio…" : status}
          </Badge>
        </div>
        {status === "ready" && !audioError && (
          <audio
            controls
            src={`/api/audio-overviews/${id}/audio`}
            className="w-full"
            data-testid={`audio-player-${id}`}
            onError={() => setAudioError(true)}
          />
        )}
        {status === "ready" && audioError && (
          <div className="flex items-center justify-between gap-2 rounded border border-destructive/40 bg-destructive/10 px-3 py-2">
            <p className="text-xs text-destructive">Audio failed to load.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              disabled={regen.isPending}
              data-testid={`audio-regen-${id}`}
            >
              <RotateCw className="h-3.5 w-3.5 mr-1" /> Regenerate
            </Button>
          </div>
        )}
        {status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={onRetry}
            disabled={regen.isPending}
            data-testid={`audio-retry-${id}`}
          >
            <RotateCw className="h-3.5 w-3.5 mr-1" /> Retry
          </Button>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground">Voice: {a?.voice ?? voice}</span>
          <AskAiButton
            notebookId={notebookId}
            context={`Quiz me on the audio overview titled "${title}". Pretend I just listened to it and ask me 5 high-yield BOC questions.`}
            size="sm"
            variant="ghost"
            className="ml-auto"
          />
        </div>
      </CardContent>
    </Card>
  );
}
