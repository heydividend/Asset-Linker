import { useMemo, useState, useEffect, useRef } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, Check, RotateCw, Sparkles, Trophy, X, ZoomIn, History } from "lucide-react";
import games from "@/data/games.json";
import { cn } from "@/lib/utils";
import {
  useCreateGameSession,
  useListGameSessions,
  getListGameSessionsQueryKey,
  getGetGamesSummaryQueryKey,
  getGetStudyPlanTodayQueryKey,
  getGetStudyPlanCompletionsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";

interface Pair { label: string; image: string }

const ROUND_SIZE = 6;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function MatchingGame() {
  const [, params] = useRoute<{ id: string }>("/games/:id");
  const game = games.games.find((g) => g.id === params?.id);
  const allPairs = useMemo<Pair[]>(() => game?.pairs ?? [], [game]);

  const [seed, setSeed] = useState(0);
  const [round, setRound] = useState<Pair[]>([]);
  const [imageOrder, setImageOrder] = useState<Pair[]>([]);
  const [labelOrder, setLabelOrder] = useState<Pair[]>([]);
  const [pickedImage, setPickedImage] = useState<string | null>(null);
  const [pickedLabel, setPickedLabel] = useState<string | null>(null);
  const [solved, setSolved] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<{ image: string; label: string } | null>(null);
  const [score, setScore] = useState(0);
  const [misses, setMisses] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [zoomed, setZoomed] = useState<Pair | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const submittedSeedRef = useRef<number>(-1);

  const qc = useQueryClient();
  const createSession = useCreateGameSession();
  const { data: history = [] } = useListGameSessions({ gameId: params?.id ?? "" });

  useEffect(() => {
    if (!game) return;
    const picks = shuffle(allPairs).slice(0, Math.min(ROUND_SIZE, allPairs.length));
    setRound(picks);
    setImageOrder(shuffle(picks));
    setLabelOrder(shuffle(picks));
    setPickedImage(null);
    setPickedLabel(null);
    setSolved(new Set());
    setWrong(null);
    setScore(0);
    setMisses(0);
    setStreak(0);
    setBestStreak(0);
    startedAtRef.current = Date.now();
    submittedSeedRef.current = -1;
  }, [seed, game, allPairs]);

  useEffect(() => {
    if (!pickedImage || !pickedLabel) return undefined;
    const correct = pickedImage === pickedLabel;
    if (correct) {
      setSolved((prev) => new Set(prev).add(pickedImage));
      setScore((s) => s + 10 + streak * 2);
      setStreak((s) => {
        const next = s + 1;
        setBestStreak((b) => Math.max(b, next));
        return next;
      });
      setPickedImage(null);
      setPickedLabel(null);
      return undefined;
    }
    setWrong({ image: pickedImage, label: pickedLabel });
    setMisses((m) => m + 1);
    setStreak(0);
    const t = setTimeout(() => {
      setWrong(null);
      setPickedImage(null);
      setPickedLabel(null);
    }, 700);
    return () => clearTimeout(t);
  }, [pickedImage, pickedLabel, streak]);

  const allDone = round.length > 0 && solved.size === round.length;

  // Persist a session row exactly once per completed round so the daily plan
  // and per-game leaderboard pick it up. Ref-guarded to avoid double-posting
  // from React strict-mode re-renders or downstream state updates.
  useEffect(() => {
    if (!game || !allDone) return;
    if (submittedSeedRef.current === seed) return;
    submittedSeedRef.current = seed;
    createSession.mutate(
      {
        data: {
          gameId: game.id,
          score,
          totalPairs: round.length,
          misses,
          bestStreak,
          durationMs: Date.now() - startedAtRef.current,
        },
      },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListGameSessionsQueryKey({ gameId: game.id }) });
          qc.invalidateQueries({ queryKey: getGetGamesSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetStudyPlanTodayQueryKey() });
          qc.invalidateQueries({ queryKey: getGetStudyPlanCompletionsQueryKey() });
        },
      },
    );
  }, [allDone, game, seed, score, misses, bestStreak, round.length, createSession, qc]);

  if (!game) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Game not found.</p>
        <Link href="/games"><Button variant="link">Back to games</Button></Link>
      </div>
    );
  }

  const bestEver = history.reduce((m, s) => Math.max(m, s.score), 0);
  const lastPlay = history[0];

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 gap-2 bg-background">
        <div className="flex items-center gap-2 min-w-0">
          <Link href="/games"><Button variant="ghost" size="sm" data-testid="button-back-games"><ArrowLeft className="h-4 w-4" /></Button></Link>
          <h1 className="text-base font-semibold truncate">{game.title}</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1"><Trophy className="h-3 w-3" />{score}</Badge>
          {streak > 1 && <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30 gap-1"><Sparkles className="h-3 w-3" />×{streak}</Badge>}
          <Badge variant="outline" className="gap-1 text-destructive border-destructive/40"><X className="h-3 w-3" />{misses}</Badge>
          <Button variant="outline" size="sm" onClick={() => setSeed((x) => x + 1)} data-testid="button-new-round"><RotateCw className="h-4 w-4 mr-1" />New round</Button>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-5xl mx-auto space-y-4">
          {(history.length > 0) && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground" data-testid="game-history-summary">
              <span className="inline-flex items-center gap-1"><History className="h-3 w-3" /> Played {history.length} time{history.length === 1 ? "" : "s"}</span>
              <span>· Best score <strong className="text-foreground">{bestEver}</strong></span>
              {lastPlay && <span>· Last: {lastPlay.score} ({lastPlay.misses} miss{lastPlay.misses === 1 ? "" : "es"})</span>}
            </div>
          )}
          {allDone ? (
            <Card className="p-8 text-center space-y-4" data-testid="game-round-complete">
              <Trophy className="h-12 w-12 text-amber-500 mx-auto" />
              <div>
                <h2 className="text-xl font-semibold">Round complete!</h2>
                <p className="text-sm text-muted-foreground">Score {score} · {misses} miss{misses === 1 ? "" : "es"} · best streak ×{bestStreak}</p>
                {createSession.isPending && (
                  <p className="text-xs text-muted-foreground mt-1">Saving your round…</p>
                )}
                {createSession.isSuccess && (
                  <p className="text-xs text-emerald-600 mt-1">Marked complete in today's plan.</p>
                )}
              </div>
              <div className="flex justify-center gap-2">
                <Button onClick={() => setSeed((x) => x + 1)} data-testid="button-play-again">Play again</Button>
                <Link href="/games"><Button variant="outline">Back to games</Button></Link>
              </div>
            </Card>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Pictures</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {imageOrder.map((p) => {
                    const isSolved = solved.has(p.label);
                    const isPicked = pickedImage === p.label;
                    const isWrong = wrong?.image === p.label;
                    return (
                      <button
                        key={p.image}
                        type="button"
                        disabled={isSolved}
                        onClick={() => setPickedImage(p.label)}
                        data-testid={`image-${p.label}`}
                        className={cn(
                          "group relative aspect-square overflow-hidden rounded-lg border-2 bg-muted transition-all",
                          isSolved && "border-emerald-500 opacity-60 cursor-default",
                          !isSolved && isPicked && "border-primary ring-2 ring-primary/30",
                          !isSolved && isWrong && "border-destructive ring-2 ring-destructive/40 animate-pulse",
                          !isSolved && !isPicked && !isWrong && "border-border hover:border-primary/50",
                        )}
                      >
                        <img src={p.image} alt="" className="w-full h-full object-cover" loading="lazy" />
                        {isSolved && (
                          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
                            <Check className="h-8 w-8 text-white drop-shadow" />
                          </div>
                        )}
                        <span
                          role="button"
                          tabIndex={0}
                          aria-label="Enlarge picture"
                          data-testid={`zoom-${p.label}`}
                          onClick={(e) => { e.stopPropagation(); setZoomed(p); }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              e.stopPropagation();
                              setZoomed(p);
                            }
                          }}
                          className="absolute top-1.5 right-1.5 inline-flex items-center justify-center h-7 w-7 rounded-md bg-background/85 backdrop-blur-sm border shadow-sm opacity-90 hover:opacity-100 hover:bg-background cursor-pointer"
                        >
                          <ZoomIn className="h-4 w-4" />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Techniques</h3>
                <div className="grid gap-2">
                  {labelOrder.map((p) => {
                    const isSolved = solved.has(p.label);
                    const isPicked = pickedLabel === p.label;
                    const isWrong = wrong?.label === p.label;
                    return (
                      <button
                        key={p.label + p.image}
                        type="button"
                        disabled={isSolved}
                        onClick={() => setPickedLabel(p.label)}
                        data-testid={`label-${p.label}`}
                        className={cn(
                          "text-left rounded-lg border-2 px-3 py-2.5 text-sm font-medium bg-card transition-all",
                          isSolved && "border-emerald-500 bg-emerald-500/10 text-muted-foreground line-through cursor-default",
                          !isSolved && isPicked && "border-primary ring-2 ring-primary/30",
                          !isSolved && isWrong && "border-destructive ring-2 ring-destructive/40 animate-pulse",
                          !isSolved && !isPicked && !isWrong && "border-border hover:border-primary/50",
                        )}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={!!zoomed} onOpenChange={(o) => { if (!o) setZoomed(null); }}>
        <DialogContent className="max-w-4xl p-2 sm:p-3" data-testid="dialog-zoom-image">
          <DialogTitle className="sr-only">Enlarged picture</DialogTitle>
          {zoomed && (
            <div className="flex items-center justify-center bg-muted rounded-md overflow-hidden">
              <img
                src={zoomed.image}
                alt={zoomed.label}
                className="max-h-[80vh] w-auto object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
