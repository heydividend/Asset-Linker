import { useMemo, useState, useEffect } from "react";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, RotateCw, Sparkles, Trophy, X } from "lucide-react";
import games from "@/data/games.json";
import { cn } from "@/lib/utils";

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
  }, [seed, game, allPairs]);

  useEffect(() => {
    if (!pickedImage || !pickedLabel) return;
    const correct = pickedImage === pickedLabel;
    if (correct) {
      setSolved((prev) => new Set(prev).add(pickedImage));
      setScore((s) => s + 10 + streak * 2);
      setStreak((s) => s + 1);
      setPickedImage(null);
      setPickedLabel(null);
    } else {
      setWrong({ image: pickedImage, label: pickedLabel });
      setMisses((m) => m + 1);
      setStreak(0);
      const t = setTimeout(() => {
        setWrong(null);
        setPickedImage(null);
        setPickedLabel(null);
      }, 700);
      return () => clearTimeout(t);
    }
  }, [pickedImage, pickedLabel, streak]);

  if (!game) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Game not found.</p>
        <Link href="/games"><Button variant="link">Back to games</Button></Link>
      </div>
    );
  }

  const allDone = round.length > 0 && solved.size === round.length;

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
        <div className="max-w-5xl mx-auto">
          {allDone ? (
            <Card className="p-8 text-center space-y-4">
              <Trophy className="h-12 w-12 text-amber-500 mx-auto" />
              <div>
                <h2 className="text-xl font-semibold">Round complete!</h2>
                <p className="text-sm text-muted-foreground">Score {score} · {misses} miss{misses === 1 ? "" : "es"}</p>
              </div>
              <Button onClick={() => setSeed((x) => x + 1)} data-testid="button-play-again">Play again</Button>
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
    </div>
  );
}
