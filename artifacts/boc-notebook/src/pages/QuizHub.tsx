import { useEffect, useState } from "react";
import { useLocation, useSearch } from "wouter";
import {
  useListQuizAttempts,
  useStartQuiz,
  useDeleteQuiz,
  useListNotebooks,
  useListTopics,
  useListDomains,
  getListQuizAttemptsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { CalendarCheck, ClipboardList, Play, Sparkles, Timer, Trash2, Users } from "lucide-react";

const MODES = [
  { value: "adaptive", label: "Adaptive (focus on your weak areas)" },
  { value: "weakness", label: "Weakness drill" },
  { value: "multi_select", label: "Scenario / Multi-select drill" },
  { value: "domain", label: "By domain" },
  { value: "topic", label: "By topic" },
];

export default function QuizHub() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: attempts = [] } = useListQuizAttempts(undefined, { query: { queryKey: getListQuizAttemptsQueryKey() } });
  const { data: notebooks = [] } = useListNotebooks();
  const { data: topics = [] } = useListTopics();
  const { data: domains = [] } = useListDomains();
  const start = useStartQuiz();
  const del = useDeleteQuiz();
  const { toast } = useToast();

  const onDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    if (!confirm("Delete this quiz attempt? This cannot be undone.")) return;
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          toast({ title: "Attempt deleted" });
        },
        onError: (err) => toast({ title: "Delete failed", description: String(err), variant: "destructive" }),
      },
    );
  };

  const [mode, setMode] = useState<"adaptive" | "weakness" | "multi_select" | "domain" | "topic">("adaptive");
  const [count, setCount] = useState("10");
  const [domainId, setDomainId] = useState<string>("");
  const [topicId, setTopicId] = useState<string>("");
  const [notebookId, setNotebookId] = useState<string>("");
  const [studyGroupOnly, setStudyGroupOnly] = useState(false);
  const [pendingReviewOnly, setPendingReviewOnly] = useState(false);
  const [timed, setTimed] = useState(false);

  const search = useSearch();
  useEffect(() => {
    const p = new URLSearchParams(search);
    const d = p.get("domain");
    const t = p.get("topic");
    const nb = p.get("notebook");
    if (t) {
      setMode("topic");
      setTopicId(t);
    } else if (d) {
      setMode("domain");
      setDomainId(d);
    }
    if (nb) setNotebookId(nb);
    if (p.get("source") === "study_group") setStudyGroupOnly(true);
    if (p.get("pendingReview") === "1" || p.get("pendingReview") === "true") {
      setStudyGroupOnly(true);
      setPendingReviewOnly(true);
    }
  }, [search]);

  const needsDomain = mode === "domain" && !domainId;
  const needsTopic = mode === "topic" && !topicId;
  const startDisabled = start.isPending || needsDomain || needsTopic;

  const onStart = () => {
    if (needsDomain) {
      toast({ title: "Pick a domain", description: "Choose which domain to quiz on.", variant: "destructive" });
      return;
    }
    if (needsTopic) {
      toast({ title: "Pick a topic", description: "Choose which topic to quiz on.", variant: "destructive" });
      return;
    }
    const data: { mode: typeof mode; count: number; notebookId?: number; topicId?: number; domainId?: number; sourceKind?: "study_group"; pendingReviewOnly?: boolean } = {
      mode,
      count: Number(count),
    };
    if (mode === "domain" && domainId) data.domainId = Number(domainId);
    if (mode === "topic" && topicId) data.topicId = Number(topicId);
    if (notebookId) data.notebookId = Number(notebookId);
    if (studyGroupOnly) data.sourceKind = "study_group";
    if (pendingReviewOnly) data.pendingReviewOnly = true;
    start.mutate(
      { data },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          navigate(timed ? `/quiz/${q.id}?timed=1` : `/quiz/${q.id}`);
        },
        onError: (e) => {
          toast({
            title: "Couldn't start the quiz",
            description: e instanceof Error ? e.message : "Try a different selection.",
            variant: "destructive",
          });
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <ClipboardList className="h-4 w-4" /> Practice Quizzes
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 shrink-0">
              <CalendarCheck className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <h2 className="font-semibold text-sm">Today's 50-question daily quiz</h2>
              <p className="text-xs text-muted-foreground">
                A fresh, original BOC-style set mixed across all 5 domains and weighted toward your
                weak areas — generated new each day and tracked toward per-domain mastery.
              </p>
            </div>
            <Button onClick={() => navigate("/daily-quiz")} data-testid="button-start-daily-quiz">
              <Play className="h-4 w-4 mr-2" /> Start daily quiz
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Start a quiz
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Mode</label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger data-testid="select-mode"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Question count</label>
                <Select value={count} onValueChange={setCount}>
                  <SelectTrigger data-testid="select-count"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["5", "10", "15", "20"].map((c) => <SelectItem key={c} value={c}>{c} questions</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {mode === "domain" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Domain</label>
                  <Select value={domainId} onValueChange={setDomainId}>
                    <SelectTrigger data-testid="select-domain"><SelectValue placeholder="Choose a domain" /></SelectTrigger>
                    <SelectContent>
                      {domains.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.code} — {d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {mode === "topic" && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Topic</label>
                  <Select value={topicId} onValueChange={setTopicId}>
                    <SelectTrigger data-testid="select-topic"><SelectValue placeholder="Choose a topic" /></SelectTrigger>
                    <SelectContent>
                      {topics.map((t) => <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-2">
                <label className="text-sm font-medium">Notebook (optional)</label>
                <Select value={notebookId || "all"} onValueChange={(v) => setNotebookId(v === "all" ? "" : v)}>
                  <SelectTrigger data-testid="select-notebook"><SelectValue placeholder="All notebooks" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All notebooks</SelectItem>
                    {notebooks.map((n) => <SelectItem key={n.id} value={String(n.id)}>{n.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-2 bg-muted/30">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium flex items-center gap-1.5" htmlFor="quiz-source-study-group">
                  <Users className="h-3.5 w-3.5" /> From study group only
                </label>
                <Switch
                  id="quiz-source-study-group"
                  checked={studyGroupOnly}
                  onCheckedChange={(v) => {
                    setStudyGroupOnly(v);
                    if (!v) setPendingReviewOnly(false);
                  }}
                  data-testid="toggle-quiz-source-study-group"
                />
              </div>
              {studyGroupOnly && (
                <div className="flex items-center justify-between gap-3 pl-5">
                  <label className="text-xs text-muted-foreground" htmlFor="quiz-pending-review">
                    Only questions still flagged pending review
                  </label>
                  <Switch
                    id="quiz-pending-review"
                    checked={pendingReviewOnly}
                    onCheckedChange={setPendingReviewOnly}
                    data-testid="toggle-quiz-pending-review"
                  />
                </div>
              )}
            </div>
            <div className="rounded-md border p-3 bg-muted/30">
              <div className="flex items-center justify-between gap-3">
                <label className="text-sm font-medium flex items-center gap-1.5" htmlFor="quiz-timed">
                  <Timer className="h-3.5 w-3.5" /> Timed (BOC pace ~82s/question)
                </label>
                <Switch id="quiz-timed" checked={timed} onCheckedChange={setTimed} data-testid="toggle-quiz-timed" />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Adds a countdown at real exam speed with an on/behind-pace meter so you can rehearse timing.
              </p>
            </div>
            <Button onClick={onStart} disabled={startDisabled} data-testid="button-start-quiz">
              <Play className="h-4 w-4 mr-2" /> Start quiz
            </Button>
          </CardContent>
        </Card>

        <Card data-tour="quiz-recent">
          <CardHeader className="p-4 pb-2"><CardTitle className="text-base">Recent attempts</CardTitle></CardHeader>
          <CardContent className="p-4 pt-0">
            {attempts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attempts yet.</p>
            ) : (
              <div className="space-y-2">
                {attempts.map((a) => {
                  const finished = !!a.finishedAt;
                  const pct = a.totalQuestions > 0 ? Math.round((a.correctCount / a.totalQuestions) * 100) : 0;
                  return (
                    <div
                      key={a.id}
                      className="flex items-center gap-2 p-2.5 border rounded-md hover-elevate min-w-0"
                      data-testid={`attempt-${a.id}`}
                    >
                      <button
                        onClick={() => navigate(`/quiz/${a.id}`)}
                        className="flex-1 flex items-center justify-between gap-2 text-left min-w-0"
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <Badge variant="outline" className="uppercase text-[10px] px-1.5 py-0">{a.mode}</Badge>
                          <span className="font-medium text-xs">{a.totalQuestions}q</span>
                          {!finished && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">In progress</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground shrink-0">
                          {finished ? `${pct}% (${a.correctCount}/${a.totalQuestions})` : "Resume"}
                        </div>
                      </button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => onDelete(e, a.id)}
                        disabled={del.isPending}
                        data-testid={`button-delete-attempt-${a.id}`}
                        aria-label="Delete attempt"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
