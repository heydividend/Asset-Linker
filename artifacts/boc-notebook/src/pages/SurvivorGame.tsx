import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Flame, Trophy, RotateCw, Skull } from "lucide-react";
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

const GAME_ID = "survivor";

export default function SurvivorGame() {
  const [seed, setSeed] = useState(0);
  const { data: questions, isLoading, refetch } = useGameQuestions({ limit: 40, single: true, seed });
  const { data: history = [] } = useListGameSessions({ gameId: GAME_ID });
  const createSession = useCreateGameSession();
  const qc = useQueryClient();

  const [idx, setIdx] = useState(0);
  const [alive, setAlive] = useState(true);
  const [correctCount, setCorrectCount] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const startedAtRef = useRef(Date.now());
  const submittedRef = useRef<number | null>(null);

  const q = questions?.[idx];
  const noQuestions = !!questions && questions.length === 0;
  const clearedAll = !!questions && questions.length > 0 && idx >= questions.length;
  const gameOver = !noQuestions && !!questions && (!alive || clearedAll);

  function reset() {
    setIdx(0);
    setAlive(true);
    setCorrectCount(0);
    setPicked(null);
    startedAtRef.current = Date.now();
    submittedRef.current = null;
    setSeed((s) => s + 1);
    refetch();
  }

  function pick(i: number) {
    if (picked != null || !q) return;
    setPicked(i);
    if (i === q.correctIndex) setCorrectCount((c) => c + 1);
    else setAlive(false);
  }

  function next() {
    setPicked(null);
    setIdx((i) => i + 1);
  }

  useEffect(() => {
    if (!gameOver || !questions) return;
    if (submittedRef.current === seed) return;
    submittedRef.current = seed;
    createSession.mutate(
      {
        data: {
          gameId: GAME_ID,
          score: correctCount,
          totalPairs: correctCount + (alive ? 0 : 1),
          misses: alive ? 0 : 1,
          bestStreak: correctCount,
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
  }, [gameOver, questions, seed, correctCount, alive, createSession, qc]);

  const bestEver = history.reduce((m, s) => Math.max(m, s.score), 0);

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4 gap-2 bg-background">
        <Link href="/games">
          <Button variant="ghost" size="sm" data-testid="button-back-games">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" /> Survivor
        </h1>
        <Badge variant="secondary" className="ml-auto gap-1">
          <Trophy className="h-3 w-3" />
          {correctCount}
        </Badge>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-xs text-muted-foreground">
            One life. Questions span all five domains and ramp up — how long can your streak survive? Best run{" "}
            <strong>{bestEver}</strong>.
          </p>

          {isLoading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </>
          ) : noQuestions ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No questions are loaded yet. Import the question bank, then come back.
              </CardContent>
            </Card>
          ) : gameOver ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <h2 className="text-lg font-semibold flex items-center justify-center gap-2">
                  {clearedAll ? "Flawless run! 🏆" : (
                    <>
                      <Skull className="h-5 w-5" /> Streak ended
                    </>
                  )}
                </h2>
                <p className="text-sm text-muted-foreground">
                  You answered <strong className="text-foreground">{correctCount}</strong> in a row
                  {bestEver > 0 && correctCount > bestEver ? " — new best!" : ""}.
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <Button onClick={reset} data-testid="button-play-again">
                    <RotateCw className="h-4 w-4 mr-1.5" /> Run again
                  </Button>
                  <Link href="/games">
                    <Button variant="outline">Back to games</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ) : !q ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No questions are loaded yet. Import the question bank, then come back.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Flame className="h-3 w-3 text-orange-500" /> Streak ×{correctCount}
                </span>
                {q.domain && <Badge variant="outline" className="text-[10px]">{q.domain}</Badge>}
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
                    ? "hover:border-primary"
                    : isCorrect
                      ? "border-emerald-500 bg-emerald-500/10"
                      : i === picked
                        ? "border-destructive bg-destructive/10"
                        : "opacity-60";
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={show}
                      onClick={() => pick(i)}
                      data-testid={`choice-${i}`}
                      className={`w-full text-left text-sm rounded-md border p-3 transition-colors disabled:cursor-default ${tone}`}
                    >
                      {c}
                    </button>
                  );
                })}
              </div>
              {picked != null && (
                <Card className="bg-muted/40">
                  <CardContent className="p-3 space-y-2">
                    <p className="text-xs text-muted-foreground whitespace-pre-wrap">{q.rationale}</p>
                    {alive && (
                      <Button size="sm" onClick={next} data-testid="button-next">
                        Next
                      </Button>
                    )}
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
