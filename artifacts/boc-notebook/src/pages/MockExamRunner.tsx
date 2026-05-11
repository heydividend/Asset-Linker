import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "wouter";
import {
  useGetMockExam,
  useAnswerMockExamQuestion,
  useHeartbeatMockExam,
  useSubmitMockExam,
  getGetMockExamQueryKey,
} from "@workspace/api-client-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { AskAiButton } from "@/components/AskAiButton";
import { StudyCoachTip } from "@/components/StudyCoachTip";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, ChevronRight, LogOut, Trophy } from "lucide-react";
import { useLocation } from "wouter";

interface MockExamResult {
  examId: number;
  scorePercent: number;
  passed: boolean;
  domainBreakdown: { domainId: number; code: string; name: string; correct: number; total: number }[];
  weakTopics: { topicId: number; name: string; mastery: number }[];
}

function formatTime(s: number) {
  const sec = Math.max(0, Math.floor(s));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const ss = sec % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

export default function MockExamRunner() {
  const params = useParams();
  const id = Number(params.id);
  const qc = useQueryClient();
  const { data: exam, isLoading } = useGetMockExam(id, { query: { enabled: !!id, queryKey: getGetMockExamQueryKey(id) } });
  const answer = useAnswerMockExamQuestion();
  const heartbeat = useHeartbeatMockExam();
  const submit = useSubmitMockExam();
  const { toast } = useToast();
  const [localIdx, setLocalIdx] = useState<number | null>(null);
  const [localPicks, setLocalPicks] = useState<Record<number, number>>({});
  const [pendingAnswerIdx, setPendingAnswerIdx] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const submittedRef = useRef(false);
  const exitingRef = useRef(false);
  const [, navigate] = useLocation();

  // Initialize localIdx once from the server's currentIndex (resume support).
  // After that, navigation is driven entirely by local state so refetches
  // don't yank the user forward when the server bumps currentIndex.
  useEffect(() => {
    if (exam && !exam.submitted && localIdx === null) {
      const start = Math.min(exam.currentIndex ?? 0, Math.max(0, exam.totalQuestions - 1));
      setLocalIdx(start);
    }
  }, [exam, localIdx]);

  // Hide global chrome while exam is in progress
  useEffect(() => {
    if (!exam || exam.submitted) return;
    document.body.classList.add("exam-mode");
    return () => document.body.classList.remove("exam-mode");
  }, [exam]);

  // Tick timer every second
  useEffect(() => {
    if (!exam || exam.submitted) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [exam]);

  // Heartbeat every 30s + on visibility/focus events
  useEffect(() => {
    if (!exam || exam.submitted) return;
    const tick = () => heartbeat.mutate({ id: exam.id, data: { event: "tick" } });
    const onVis = () => heartbeat.mutate({ id: exam.id, data: { event: document.hidden ? "hidden" : "visible" } });
    const onBlur = () => heartbeat.mutate({ id: exam.id, data: { event: "blur" } });
    const onFocus = () => heartbeat.mutate({ id: exam.id, data: { event: "focus" } });
    const interval = setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam?.id, exam?.submitted]);

  // Auto-submit when timer hits 0. Use plain fetch with `auto:true` body so the
  // server records this as auto-submitted (the generated client has no body param).
  const remaining = exam ? Math.max(0, exam.timeLimitSec - Math.floor((now - new Date(exam.startedAt).getTime()) / 1000)) : 0;
  useEffect(() => {
    if (!exam || exam.submitted || submittedRef.current) return;
    if (remaining <= 0) {
      submittedRef.current = true;
      void fetch(`/api/mock-exams/${exam.id}/submit?auto=true`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto: true }),
      })
        .catch(() => {})
        .finally(() => qc.invalidateQueries({ queryKey: getGetMockExamQueryKey(id) }));
    }
  }, [remaining, exam, qc, id]);

  // Block accidental tab close / refresh while exam is live.
  useEffect(() => {
    if (!exam || exam.submitted) return;
    const handler = (e: BeforeUnloadEvent) => {
      if (exitingRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [exam?.id, exam?.submitted]);

  // Fetch result once submitted
  const { data: result } = useQuery<MockExamResult>({
    queryKey: ["mock-exam-result", id],
    queryFn: () => fetch(`/api/mock-exams/${id}/result`).then((r) => r.json()),
    enabled: !!exam?.submitted,
  });

  if (isLoading || !exam) return <div className="p-6">Loading exam…</div>;

  if (exam.submitted) {
    return (
      <div className="flex flex-col h-full">
        <header className="h-14 border-b flex items-center px-6">
          <h1 className="text-lg font-semibold">Mock Exam Results</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-6 max-w-4xl mx-auto w-full space-y-6">
          {!result ? (
            <p>Calculating results…</p>
          ) : (
            <>
              <Card className={result.passed ? "bg-primary text-primary-foreground border-none" : "bg-destructive text-destructive-foreground border-none"}>
                <CardContent className="p-8 text-center">
                  <Trophy className="h-10 w-10 mx-auto mb-2" />
                  <p className="text-5xl font-bold" data-testid="text-mock-score">{Math.round(result.scorePercent)}%</p>
                  <p className="opacity-90 mt-1">{result.passed ? "Passed" : "Below 75% threshold"}</p>
                  {exam.autoSubmitted && <Badge className="mt-3 bg-background/20"><AlertTriangle className="h-3 w-3 mr-1" /> Auto-submitted at time limit</Badge>}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>By domain</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {result.domainBreakdown.map((d) => {
                    const pct = d.total > 0 ? Math.round((d.correct / d.total) * 100) : 0;
                    return (
                      <div key={d.domainId} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="font-medium">{d.code} — {d.name}</span>
                          <span className="text-muted-foreground">{d.correct}/{d.total} ({pct}%)</span>
                        </div>
                        <Progress value={pct} className="h-2" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {result.weakTopics.length > 0 && (
                <Card>
                  <CardHeader><CardTitle>Topics to focus on</CardTitle></CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    {result.weakTopics.map((t) => (
                      <div key={t.topicId} className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-full text-sm">
                        <span>{t.name}</span>
                        <AskAiButton context={`I struggled with this BOC topic on my mock exam: ${t.name}. Walk me through the high-yield concepts I need to lock in.`} size="icon" variant="ghost" className="h-5 w-5" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="flex gap-2 justify-end">
                <AskAiButton context={`Help me review my mock exam. I scored ${Math.round(result.scorePercent)}%. My weakest domains were: ${result.domainBreakdown.filter(d => d.total > 0).sort((a,b) => (a.correct/a.total) - (b.correct/b.total)).slice(0,2).map(d => d.name).join(", ")}. Build me a focused 3-day study plan.`} label="Ask AI to plan my recovery" />
                <Link href="/mock-exam"><Button data-testid="button-take-another">Take another</Button></Link>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  const total = exam.totalQuestions;
  const rawIdx = localIdx ?? exam.currentIndex;
  const idx = Math.min(Math.max(0, rawIdx), Math.max(0, total - 1));
  const q = exam.questions[idx];

  if (!q) return <div className="p-6">No question.</div>;

  const pickedIdx = localPicks[idx] ?? q.selectedIndex;
  const isAnswered = pickedIdx != null;
  const isPendingHere = pendingAnswerIdx === idx;
  const canAdvance = isAnswered && !isPendingHere;

  const onPick = (choiceIdx: number) => {
    if (isAnswered || isPendingHere) return;
    const targetIdx = idx;
    setLocalPicks((p) => ({ ...p, [targetIdx]: choiceIdx }));
    setPendingAnswerIdx(targetIdx);
    answer.mutate(
      { id: exam.id, data: { index: targetIdx, selectedIndex: choiceIdx } },
      {
        onSuccess: () => {
          setPendingAnswerIdx((cur) => (cur === targetIdx ? null : cur));
          qc.invalidateQueries({ queryKey: getGetMockExamQueryKey(id) });
        },
        onError: (err) => {
          // Roll back optimistic pick AND any forward navigation past this question.
          setLocalPicks((p) => {
            const next = { ...p };
            delete next[targetIdx];
            return next;
          });
          setPendingAnswerIdx((cur) => (cur === targetIdx ? null : cur));
          setLocalIdx((cur) => (cur != null && cur > targetIdx ? targetIdx : cur));
          toast({
            title: "Couldn't save your answer",
            description: err instanceof Error ? err.message : "Please try again.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const submitBlocked = pendingAnswerIdx !== null || answer.isPending || submit.isPending;
  const onExit = () => {
    if (!confirm("Exit this exam? Your answers so far are saved — you can resume from the Mock Exam page.")) return;
    exitingRef.current = true;
    navigate("/mock-exam");
  };
  const onSubmit = () => {
    if (submitBlocked) {
      toast({ title: "Hang on", description: "Saving your last answer…" });
      return;
    }
    if (!confirm("Submit your exam now? You will not be able to change answers.")) return;
    submit.mutate({ id: exam.id }, { onSuccess: () => qc.invalidateQueries({ queryKey: getGetMockExamQueryKey(id) }) });
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      <header className="h-14 border-b flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Stethoscope />
          <span className="font-semibold">BOC Mock Exam</span>
          <Badge variant="outline">Q {idx + 1} of {total}</Badge>
        </div>
        <div className="flex items-center gap-3">
          <div className={`text-2xl font-mono tabular-nums ${remaining < 600 ? "text-destructive" : ""}`} data-testid="text-timer">
            {formatTime(remaining)}
          </div>
          <Button variant="ghost" size="sm" onClick={onExit} data-testid="button-exit-exam" title="Save progress and exit — you can resume later">
            <LogOut className="h-4 w-4 mr-1" /> Exit
          </Button>
          <Button variant="destructive" size="sm" onClick={onSubmit} disabled={submitBlocked} data-testid="button-submit-exam">Submit</Button>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        {idx === 0 && <StudyCoachTip context="mock-pacing" />}
        {idx > 0 && idx % 25 === 0 && <StudyCoachTip context="mock-stuck" />}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg leading-relaxed" data-testid="text-mock-stem">{q.stem}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.choices.map((c, ci) => {
              const picked = pickedIdx === ci;
              return (
                <button
                  key={ci}
                  onClick={() => onPick(ci)}
                  disabled={isAnswered}
                  className={`w-full text-left p-3 rounded-lg border ${picked ? "border-primary bg-primary/10" : "border-border hover-elevate cursor-pointer"} ${isAnswered && !picked ? "opacity-60" : ""}`}
                  data-testid={`mock-choice-${ci}`}
                >
                  <span className="font-medium mr-2">{String.fromCharCode(65 + ci)}.</span>
                  {c}
                </button>
              );
            })}
          </CardContent>
        </Card>
        <div className="flex justify-end">
          {idx + 1 < total ? (
            <Button onClick={() => setLocalIdx(idx + 1)} disabled={!canAdvance} data-testid="button-mock-next">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={onSubmit} disabled={!canAdvance || submitBlocked} data-testid="button-mock-finish">Submit exam</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stethoscope() {
  return <span className="inline-block w-5 h-5 rounded-full bg-primary" />;
}
