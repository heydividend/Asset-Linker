import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListQuizAttempts,
  useStartQuiz,
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
import { ClipboardList, Play, Sparkles } from "lucide-react";

const MODES = [
  { value: "adaptive", label: "Adaptive (focus on your weak areas)" },
  { value: "weakness", label: "Weakness drill" },
  { value: "domain", label: "By domain" },
  { value: "topic", label: "By topic" },
];

export default function QuizHub() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { data: attempts = [] } = useListQuizAttempts({ query: { queryKey: getListQuizAttemptsQueryKey() } });
  const { data: notebooks = [] } = useListNotebooks();
  const { data: topics = [] } = useListTopics();
  const { data: domains = [] } = useListDomains();
  const start = useStartQuiz();

  const [mode, setMode] = useState<"adaptive" | "weakness" | "domain" | "topic">("adaptive");
  const [count, setCount] = useState("10");
  const [domainId, setDomainId] = useState<string>("");
  const [topicId, setTopicId] = useState<string>("");
  const [notebookId, setNotebookId] = useState<string>("");

  const onStart = () => {
    const data: { mode: typeof mode; count: number; notebookId?: number; topicId?: number; domainId?: number } = {
      mode,
      count: Number(count),
    };
    if (mode === "domain" && domainId) data.domainId = Number(domainId);
    if (mode === "topic" && topicId) data.topicId = Number(topicId);
    if (notebookId) data.notebookId = Number(notebookId);
    start.mutate(
      { data },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          navigate(`/quiz/${q.id}`);
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center px-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <ClipboardList className="h-5 w-5" /> Practice Quizzes
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl mx-auto w-full">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Start a quiz
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
            <Button onClick={onStart} disabled={start.isPending} size="lg" data-testid="button-start-quiz">
              <Play className="h-4 w-4 mr-2" /> Start quiz
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent attempts</CardTitle></CardHeader>
          <CardContent>
            {attempts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No attempts yet.</p>
            ) : (
              <div className="space-y-2">
                {attempts.map((a) => {
                  const finished = !!a.finishedAt;
                  const pct = a.totalQuestions > 0 ? Math.round((a.correctCount / a.totalQuestions) * 100) : 0;
                  return (
                    <button
                      key={a.id}
                      onClick={() => navigate(`/quiz/${a.id}`)}
                      className="w-full flex items-center justify-between p-3 border rounded-md hover-elevate text-left"
                      data-testid={`attempt-${a.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="uppercase text-xs">{a.mode}</Badge>
                        <span className="font-medium">{a.totalQuestions} questions</span>
                        {!finished && <Badge variant="secondary">In progress</Badge>}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {finished ? `${pct}% (${a.correctCount}/${a.totalQuestions})` : "Resume"}
                      </div>
                    </button>
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
