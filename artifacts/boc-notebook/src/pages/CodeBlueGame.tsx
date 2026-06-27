import { useEffect, useRef, useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Heart, HeartCrack, Siren, Trophy, RotateCw } from "lucide-react";
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

const GAME_ID = "code-blue";
const START_LIVES = 3;

export default function CodeBlueGame() {
  const [seed, setSeed] = useState(0);
  const { data: questions, isLoading, refetch } = useGameQuestions({ domain: "D3", limit: 20, single: true, seed });
  const { data: history = [] } = useListGameSessions({ gameId: GAME_ID });
  const createSession = useCreateGameSession();
  const qc = useQueryClient();

  const [idx, setIdx] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [misses, setMisses] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const startedAtRef = useRef(Date.now());
  const submittedRef = useRef<number | null>(null);

  const q = questions?.[idx];
  const noQuestions = !!questions && questions.length === 0;
  const outOfQuestions = !!questions && questions.length > 0 && idx >= questions.length;
  const gameOver = !noQuestions && !!questions && (lives <= 0 || outOfQuestions);

  function reset() {
    setIdx(0);
    setLives(START_LIVES);
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setMisses(0);
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
      const level = idx + 1;
      setScore((s) => s + 10 + level * 2);
      setStreak((s) => {
        const ns = s + 1;
        setBestStreak((b) => Math.max(b, ns));
        return ns;
      });
    } else {
      setLives((l) => l - 1);
      setMisses((m) => m + 1);
      setStreak(0);
    }
  }

  function next() {
    setPicked(null);
    setIdx((i) => i + 1);
  }

  // Record the run once when it ends.
  useEffect(() => {
    if (!gameOver || !questions) return;
    if (submittedRef.current === seed) return;
    submittedRef.current = seed;
    createSession.mutate(
      {
        data: {
          gameId: GAME_ID,
          score,
          totalPairs: idx, // questions faced this run
          misses,
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
  }, [gameOver, questions, seed, score, idx, misses, bestStreak, createSession, qc]);

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
          <Siren className="h-4 w-4 text-destructive" /> Code Blue
        </h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-0.5" aria-label={`${lives} lives left`}>
            {Array.from({ length: START_LIVES }).map((_, i) =>
              i < lives ? (
                <Heart key={i} className="h-4 w-4 text-destructive fill-destructive" />
              ) : (
                <HeartCrack key={i} className="h-4 w-4 text-muted-foreground" />
              ),
            )}
          </span>
          <Badge variant="secondary" className="gap-1">
            <Trophy className="h-3 w-3" />
            {score}
          </Badge>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-4">
          <p className="text-xs text-muted-foreground">
            Critical Incident Management (Domain III). Pick the <strong>best immediate action</strong>. Three
            complications and the patient codes. Best score <strong>{bestEver}</strong>.
          </p>

          {isLoading ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-40" />
            </>
          ) : noQuestions ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No emergency (Domain III) questions are loaded yet. Import the question bank, then come back.
              </CardContent>
            </Card>
          ) : gameOver ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <h2 className="text-lg font-semibold">{outOfQuestions ? "You cleared the shift! 🎉" : "Patient coded."}</h2>
                <p className="text-sm text-muted-foreground">
                  Score <strong className="text-foreground">{score}</strong> · reached level {idx} · best streak ×{bestStreak} · {misses} complication
                  {misses === 1 ? "" : "s"}
                </p>
                <div className="flex justify-center gap-2 pt-2">
                  <Button onClick={reset} data-testid="button-play-again">
                    <RotateCw className="h-4 w-4 mr-1.5" /> New shift
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
                No emergency questions are loaded yet. Import the question bank, then come back.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Level {idx + 1}</span>
                <span>Streak ×{streak}</span>
              </div>
              <Card className="border-destructive/30">
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
                    <Button size="sm" onClick={next} data-testid="button-next">
                      {idx + 1 >= (questions?.length ?? 0) || lives <= 0 ? "Finish" : "Next patient"}
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
