import { useLocation } from "wouter";
import {
  useGetBlueprint,
  useRateTaskConfidence,
  useStartQuiz,
  getGetBlueprintQueryKey,
  getListQuizAttemptsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ClipboardCheck, Play, Target } from "lucide-react";

type BlueprintTask = {
  id: number;
  code: string;
  statement: string;
  confidence: number | null;
  sortOrder: number;
  mastery: number;
  attempts: number;
  correct: number;
  questionCount: number;
};

const CONFIDENCE_OPTIONS: { value: 1 | 2 | 3; label: string; activeClass: string }[] = [
  { value: 1, label: "Shaky", activeClass: "bg-red-500 text-white border-red-500 hover:bg-red-500" },
  { value: 2, label: "Okay", activeClass: "bg-amber-500 text-white border-amber-500 hover:bg-amber-500" },
  { value: 3, label: "Solid", activeClass: "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-600" },
];

function masteryColor(m: number): string {
  if (m >= 0.8) return "bg-emerald-600";
  if (m >= 0.6) return "bg-amber-500";
  return "bg-red-500";
}

export default function BlueprintPage() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useGetBlueprint();
  const rate = useRateTaskConfidence();
  const start = useStartQuiz();

  const setConfidence = (taskId: number, current: number | null, value: 1 | 2 | 3) => {
    const next = current === value ? null : value;
    rate.mutate(
      { id: taskId, data: { confidence: next } },
      {
        onSuccess: () => qc.invalidateQueries({ queryKey: getGetBlueprintQueryKey() }),
        onError: (e) =>
          toast({
            title: "Couldn't save rating",
            description: e instanceof Error ? e.message : "Try again.",
            variant: "destructive",
          }),
      },
    );
  };

  const drillTask = (task: BlueprintTask) => {
    if (task.questionCount === 0) {
      toast({
        title: "No questions yet",
        description: `No questions are tagged to task ${task.code} yet.`,
        variant: "destructive",
      });
      return;
    }
    start.mutate(
      { data: { mode: "topic", count: Math.min(10, task.questionCount), taskId: task.id } },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          navigate(`/quiz/${q.id}`);
        },
        onError: (e) =>
          toast({
            title: "Couldn't start drill",
            description: e instanceof Error ? e.message : "Try a different task.",
            variant: "destructive",
          }),
      },
    );
  };

  const domains = data?.domains ?? [];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4 shrink-0">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Target className="h-4 w-4" /> Exam Blueprint
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-4xl mx-auto w-full">
        <p className="text-sm text-muted-foreground">
          The official BOC Practice Analysis 8th Edition content outline — the five domains and the
          25 task statements the exam is built from. Rate how confident you feel on each task, see
          your objective mastery from answered questions, and drill any task directly.
        </p>

        {isLoading && <p className="text-sm text-muted-foreground">Loading blueprint…</p>}

        {domains.map((d) => {
          const rated = d.tasks.filter((t) => t.confidence != null).length;
          return (
            <Card key={d.id} data-testid={`domain-${d.code}`}>
              <CardHeader className="p-4 pb-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono">{d.code}</Badge>
                    {d.name}
                  </CardTitle>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline">{Math.round(d.weight * 100)}% of exam</Badge>
                    <span>{rated}/{d.tasks.length} rated</span>
                  </div>
                </div>
                {d.description && (
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{d.description}</p>
                )}
              </CardHeader>
              <CardContent className="p-4 pt-0 space-y-3">
                {d.tasks.map((t) => (
                  <div key={t.id} className="rounded-md border p-3 space-y-2.5" data-testid={`task-${t.code}`}>
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] shrink-0 mt-0.5">{t.code}</Badge>
                      <p className="text-sm leading-relaxed flex-1">{t.statement}</p>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground mr-1">Confidence:</span>
                        {CONFIDENCE_OPTIONS.map((opt) => {
                          const active = t.confidence === opt.value;
                          return (
                            <button
                              key={opt.value}
                              onClick={() => setConfidence(t.id, t.confidence, opt.value)}
                              disabled={rate.isPending}
                              data-testid={`confidence-${t.code}-${opt.value}`}
                              className={`text-xs px-2 py-1 rounded border transition-colors ${
                                active ? opt.activeClass : "border-input bg-background hover:bg-accent"
                              }`}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex-1 min-w-[140px]">
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
                          <span>Mastery</span>
                          <span>
                            {t.attempts > 0 ? `${Math.round(t.mastery * 100)}% (${t.correct}/${t.attempts})` : "Not attempted"}
                          </span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          {t.attempts > 0 && (
                            <div
                              className={`h-full ${masteryColor(t.mastery)}`}
                              style={{ width: `${Math.round(t.mastery * 100)}%` }}
                            />
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8"
                        onClick={() => drillTask(t)}
                        disabled={start.isPending || t.questionCount === 0}
                        data-testid={`drill-${t.code}`}
                      >
                        <Play className="h-3.5 w-3.5 mr-1.5" />
                        Drill
                        <span className="ml-1.5 text-muted-foreground">({t.questionCount})</span>
                      </Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          );
        })}

        {!isLoading && domains.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8 mb-2" />
            <p className="text-sm">No blueprint data found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
