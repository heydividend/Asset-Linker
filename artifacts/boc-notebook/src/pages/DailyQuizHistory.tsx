import { useState } from "react";
import { useLocation } from "wouter";
import { useGetDailyQuizHistory, usePracticeQuizSet } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, CalendarCheck, ChevronLeft, History, Minus, RotateCcw, Shuffle, TrendingUp } from "lucide-react";
import { DailyScoreTrend, type DailyScorePoint } from "@/components/DailyScoreTrend";

function formatDate(ymd: string): string {
  // ymd is a Pacific YYYY-MM-DD; render it without timezone drift.
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function toPct(h: { score: number | null; correctCount: number; totalQuestions: number }): number {
  return h.score != null
    ? Math.round(h.score)
    : h.totalQuestions > 0
      ? Math.round((h.correctCount / h.totalQuestions) * 100)
      : 0;
}

function DeltaBadge({ delta }: { delta: number }) {
  if (delta === 0) {
    return (
      <span className="text-[11px] text-muted-foreground inline-flex items-center gap-0.5">
        <Minus className="h-3 w-3" /> 0
      </span>
    );
  }
  const up = delta > 0;
  return (
    <span
      className={`text-[11px] font-medium inline-flex items-center gap-0.5 ${up ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}
    >
      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {up ? "+" : ""}
      {delta}
    </span>
  );
}

function PracticeAgainButton({ quizId }: { quizId: number }) {
  const [, navigate] = useLocation();
  const practice = usePracticeQuizSet();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [shuffleQuestions, setShuffleQuestions] = useState(false);
  const [shuffleChoices, setShuffleChoices] = useState(false);

  const onStart = () => {
    practice.mutate(
      { id: quizId, data: { shuffleQuestions, shuffleChoices } },
      {
        onSuccess: (quiz) => {
          setOpen(false);
          navigate(`/quiz/${quiz.id}`);
        },
        onError: (e) =>
          toast({
            title: "Couldn't start practice",
            description: e instanceof Error ? e.message : "Try again in a moment.",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs shrink-0"
          disabled={practice.isPending}
          data-testid={`button-practice-set-${quizId}`}
          title="Re-take this exact set as a fresh, independently-scored practice run"
        >
          <RotateCcw className="h-3 w-3 mr-1" /> Practice again
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-medium flex items-center gap-1.5">
            <Shuffle className="h-3.5 w-3.5 text-primary" /> Reshuffle this retake
          </p>
          <p className="text-xs text-muted-foreground">
            Same questions, harder to game by memorizing answer positions.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Checkbox
              id={`shuffle-q-${quizId}`}
              checked={shuffleQuestions}
              onCheckedChange={(v) => setShuffleQuestions(v === true)}
              data-testid={`checkbox-shuffle-questions-${quizId}`}
            />
            <Label htmlFor={`shuffle-q-${quizId}`} className="text-xs font-normal cursor-pointer">
              Shuffle question order
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`shuffle-c-${quizId}`}
              checked={shuffleChoices}
              onCheckedChange={(v) => setShuffleChoices(v === true)}
              data-testid={`checkbox-shuffle-choices-${quizId}`}
            />
            <Label htmlFor={`shuffle-c-${quizId}`} className="text-xs font-normal cursor-pointer">
              Shuffle answer choices
            </Label>
          </div>
        </div>
        <Button
          size="sm"
          className="w-full h-7 text-xs"
          onClick={onStart}
          disabled={practice.isPending}
          data-testid={`button-start-practice-${quizId}`}
        >
          {shuffleQuestions || shuffleChoices ? "Start reshuffled retake" : "Start practice"}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

export default function DailyQuizHistory() {
  const [, navigate] = useLocation();
  const { data: history = [], isLoading } = useGetDailyQuizHistory();

  // History arrives newest-first; the trend reads best oldest → newest.
  const trendPoints: DailyScorePoint[] = [...history].reverse().map((h) => ({
    date: h.date,
    pct: toPct(h),
    correctCount: h.correctCount,
    totalQuestions: h.totalQuestions,
  }));

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center gap-2 px-4">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => navigate("/quiz")}
          data-testid="button-back-to-quiz"
          aria-label="Back to practice"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-base font-semibold flex items-center gap-2">
          <History className="h-4 w-4" /> Past daily quizzes
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 max-w-3xl mx-auto w-full space-y-4">
        {!isLoading && history.length > 0 && (
          <Card data-testid="card-daily-score-trend">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Score over time
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Each bar is one day's daily quiz score. Hover a bar for that day's detail.
              </p>
            </CardHeader>
            <CardContent className="p-4 pt-2">
              <DailyScoreTrend points={trendPoints} testId="daily-score-trend" />
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" /> Review an earlier day
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Each day's 50-question set is generated fresh. Open any past day to re-read every
              question, your answers, and the full rationales.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            {isLoading ? (
              <p className="text-xs text-muted-foreground">Loading…</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-muted-foreground" data-testid="text-no-daily-history">
                No finished daily quizzes yet. Complete today's daily quiz and it'll show up here.
              </p>
            ) : (
              <div className="space-y-2">
                {history.map((h) => {
                  const pct = toPct(h);
                  const retakes = h.retakes ?? [];
                  return (
                    <div
                      key={h.id}
                      className="p-3 border rounded-md min-w-0 space-y-2"
                      data-testid={`daily-history-${h.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => navigate(`/quiz/${h.id}`)}
                          className="flex-1 flex items-center justify-between gap-2 text-left min-w-0 hover-elevate rounded-md -m-1 p-1"
                          data-testid={`daily-history-review-${h.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-wrap">
                            <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                            <span className="font-medium text-sm">{formatDate(h.date)}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {h.totalQuestions}q
                            </Badge>
                            {retakes.length > 0 && (
                              <Badge
                                variant="secondary"
                                className="text-[10px] px-1.5 py-0"
                                data-testid={`daily-history-retake-count-${h.id}`}
                              >
                                {retakes.length} retake{retakes.length === 1 ? "" : "s"}
                              </Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground shrink-0">
                            {pct}% ({h.correctCount}/{h.totalQuestions})
                          </span>
                        </button>
                        <PracticeAgainButton quizId={h.id} />
                      </div>
                      {retakes.length > 0 &&
                        (() => {
                          const bestPct = Math.max(...retakes.map(toPct));
                          const improvement = bestPct - pct;
                          const beaten = improvement > 0;
                          return (
                            <div
                              className="pl-6 ml-2 text-xs"
                              data-testid={`daily-history-best-${h.id}`}
                            >
                              {beaten ? (
                                <span className="font-medium inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                  <TrendingUp className="h-3 w-3" />
                                  Best {bestPct}% · +{improvement} vs original {pct}%
                                </span>
                              ) : (
                                <span className="text-muted-foreground inline-flex items-center gap-1">
                                  <Minus className="h-3 w-3" />
                                  Best retake {bestPct}% — hasn't beaten your original {pct}% yet
                                </span>
                              )}
                            </div>
                          );
                        })()}
                      {retakes.length > 0 && (
                        <div
                          className="pl-6 space-y-1 border-l ml-2"
                          data-testid={`daily-history-retakes-${h.id}`}
                        >
                          {retakes.map((rt, i) => {
                            const rtPct = toPct(rt);
                            return (
                              <button
                                key={rt.id}
                                onClick={() => navigate(`/quiz/${rt.id}`)}
                                className="w-full flex items-center justify-between gap-2 text-left text-xs hover-elevate rounded-md p-1.5"
                                data-testid={`daily-history-retake-${rt.id}`}
                              >
                                <span className="text-muted-foreground">
                                  Retake {i + 1} <span className="opacity-70">· original {pct}% → {rtPct}%</span>
                                </span>
                                <span className="flex items-center gap-2 shrink-0">
                                  <span className="text-muted-foreground">
                                    ({rt.correctCount}/{rt.totalQuestions})
                                  </span>
                                  <DeltaBadge delta={rtPct - pct} />
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
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
