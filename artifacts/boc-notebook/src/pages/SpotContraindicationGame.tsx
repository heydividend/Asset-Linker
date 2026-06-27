import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Ban, Trophy, RotateCw, Check, X } from "lucide-react";
import { useGameQuestions } from "@/hooks/use-game-questions";
import {
  useCreateGameSession,
  useListGameSessions,
  getListGameSessionsQueryKey,
  getGetGamesSummaryQueryKey,
  getGetStudyPlanTodayQueryKey,
  getGetStudyPlanCompletionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

const GAME_ID = "spot-contraindication";
const ROUND = 12;

export default function SpotContraindicationGame() {
  const [seed, setSeed] = useState(0);
  const { data: questions, isLoading, refetch } = useGameQuestions({ mode: "contraindication", single: true, limit: ROUND, seed });
  const { data: history = [] } = useListGameSessions({ gameId: GAME_ID });
  const createSession = useCreateGameSession();
  const qc = useQueryClient();

  const [idx, setIdx] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [curStreak, setCurStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const startedAtRef = useRef(Date.now());
  const submittedRef = useRef<number | null>(null);

  const total = questions?.length ?? 0;
  const q = questions?.[idx];
  const noQuestions = !!questions && total === 0;
  const finished = !noQuestions && !!questions && idx >= total;

  function reset() {
    setIdx(0);
    setCorrectCount(0);
    setCurStreak(0);
    setBestStreak(0);
    setPicked(null);
    startedAtRef.current = Date.now();
    submittedRef.current = null;
    setSeed((s) => s + 1);
    refetch();
  }

  function pick(i: number) {
    if (picked != null || !q) return;
    setPicked(i);
    if (i === q.correctIndex) {
      setCorrectCount((c) => c + 1);
      setCurStreak((s) => {
        const ns = s + 1;
        setBestStreak((b) => Math.max(b, ns));
        return ns;
      });
    } else {
      setCurStreak(0);
    }
  }

  function next() {
    setPicked(null);
    setIdx((i) => i + 1);
  }

  useEffect(() => {
    if (!finished || !questions) return;
    if (submittedRef.current === seed) return;
    submittedRef.current = seed;
    createSession.mutate(
      {
        data: {
          gameId: GAME_ID,
          score: correctCount,
          totalPairs: total,
          misses: total - correctCount,
          bestStreak,
          durationMs: Date.now() - startedAtRef.current,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey({ gameId: GAME_ID }) });
          qc.invalidateQueries({ queryKey: getGetGamesSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetStudyPlanTodayQueryKey() });
          qc.invalidateQueries({ queryKey: getGetStudyPlanCompletionsQueryKey() });
        },
      },
    );
  }, [finished, questions, seed, correctCount, total, bestStreak, createSession, qc]);

  const bestEver = history.reduce((m, s) => Math.max(m, s.score), 0);
  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4 gap-2 bg-background">
        <Link href="/games">
          <Button variant="ghost" size="sm" data-testid="button-back-games">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Ban className="h-4 w-4 text-destructive" /> Spot the Contraindication
        </h1>
        <div className="ml-auto flex items-center gap-2">
          {!noQuestions && !finished && total > 0 && (
            <span className="text-xs text-muted-foreground">
              {Math.min(idx + 1, total)}/{total}
            </span>
          )}
          <Badge variant="secondary" className="gap-1">
            <Trophy className="h-3 w-3" />
            {correctCount}
          </Badge>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-xs text-muted-foreground">
            One option is contraindicated or not appropriate — tap it. This is the exact "which is NOT appropriate"
            pattern that's all over the real exam. Best score <strong>{bestEver}</strong>.
          </p>

          {isLoading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </>
          ) : noQuestions ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No contraindication-style questions are loaded yet. Import the question bank, then come back.
              </CardContent>
            </Card>
          ) : finished ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <h2 className="text-lg font-semibold">Round complete</h2>
                <p className="text-sm text-muted-foreground">
                  <strong className="text-foreground">{correctCount}</strong> / {total} correct ({accuracy}%) · best
                  streak ×{bestStreak}
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <Button onClick={reset} data-testid="button-play-again">
                    <RotateCw className="h-4 w-4 mr-1.5" /> New round
                  </Button>
                  <Link href="/games">
                    <Button variant="outline">Back to games</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : !q ? null : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Streak ×{curStreak}</span>
                {q.domain && (
                  <Badge variant="outline" className="text-[10px]">
                    {q.domain}
                  </Badge>
                )}
              </div>
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm font-medium whitespace-pre-wrap">{q.stem}</p>
                </CardContent>
              </Card>
              <div className="space-y-2">
                {q.choices.map((c, i) => {
                  const isCorrect = i === q.correctIndex;
                  const show = picked != null;
                  const tone = !show
                    ? "hover:border-destructive/60"
                    : isCorrect
                      ? "border-destructive bg-destructive/10"
                      : i === picked
                        ? "border-muted-foreground/40 bg-muted"
                        : "opacity-60";
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={show}
                      onClick={() => pick(i)}
                      data-testid={`choice-${i}`}
                      className={`w-full text-left text-sm rounded-md border p-3 transition-colors disabled:cursor-default flex items-center gap-2 ${tone}`}
                    >
                      <span className="flex-1">{c}</span>
                      {show && isCorrect && <Ban className="h-4 w-4 text-destructive shrink-0" />}
                      {show && i === picked && !isCorrect && <X className="h-4 w-4 text-muted-foreground shrink-0" />}
                      {show && i === picked && isCorrect && <Check className="h-4 w-4 text-destructive shrink-0" />}
                    </button>
                  );
                })}
              </div>
              {picked != null && (
                <Card className="bg-muted/40">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{q.rationale}</p>
                    <Button size="sm" onClick={next} data-testid="button-next">
                      {idx + 1 >= total ? "See results" : "Next"}
                    </Button>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
