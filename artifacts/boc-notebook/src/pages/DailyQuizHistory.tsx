import { useLocation } from "wouter";
import { useGetDailyQuizHistory } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarCheck, ChevronLeft, History, TrendingUp } from "lucide-react";
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
                  return (
                    <button
                      key={h.id}
                      onClick={() => navigate(`/quiz/${h.id}`)}
                      className="w-full flex items-center justify-between gap-2 p-3 border rounded-md hover-elevate text-left min-w-0"
                      data-testid={`daily-history-${h.id}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-wrap">
                        <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-medium text-sm">{formatDate(h.date)}</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {h.totalQuestions}q
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {pct}% ({h.correctCount}/{h.totalQuestions})
                      </span>
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
