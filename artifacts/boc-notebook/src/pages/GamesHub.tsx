import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Gamepad2, Image as ImageIcon, Trophy, Flame, Siren, Ban } from "lucide-react";
import games from "@/data/games.json";

// Question-driven games (not matching decks) — featured above the matching grid.
const FEATURED_GAMES = [
  {
    id: "code-blue",
    title: "Code Blue: Emergency Triage",
    description: "Pick the best first action in escalating emergencies. Three complications and the patient codes — Domain III drill.",
    icon: Siren,
    accent: "text-destructive",
  },
  {
    id: "survivor",
    title: "Survivor: Streak Gauntlet",
    description: "One life, all five domains, ramping difficulty. How long can your answer streak survive?",
    icon: Flame,
    accent: "text-orange-500",
  },
  {
    id: "spot-contraindication",
    title: "Spot the Contraindication",
    description: "Tap the one option that's contraindicated or not appropriate — the exam's most common trap, drilled.",
    icon: Ban,
    accent: "text-destructive",
  },
] as const;
import {
  useGetGamesSummary,
  useGetStudyPlanToday,
} from "@workspace/api-client-react";

export default function GamesHub() {
  const { data: summary = [] } = useGetGamesSummary();
  const { data: plan } = useGetStudyPlanToday();
  const summaryByGame = new Map(summary.map((s) => [s.gameId, s]));
  const todaysGameItem = plan?.items?.find((i) => i.kind === "game");
  const todaysGameId = todaysGameItem?.gameId ?? null;

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4 gap-2 bg-background">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Gamepad2 className="h-5 w-5" /> Games
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto space-y-4">
          {todaysGameItem && (
            <Card className="border-primary/40 bg-primary/5" data-testid="todays-game-banner">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-primary font-semibold">Today's game</p>
                  <p className="text-sm font-medium truncate">{todaysGameItem.title}</p>
                  <p className="text-xs text-muted-foreground">~{todaysGameItem.estMinutes} min · mandatory in your daily mix</p>
                </div>
                {todaysGameId && (
                  <Link href={`/games/${todaysGameId}`}>
                    <Button size="sm" data-testid="button-play-todays-game">
                      {todaysGameItem.completed ? "Play again" : "Play now"}
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid sm:grid-cols-2 gap-4">
            {FEATURED_GAMES.map((g) => {
              const s = summaryByGame.get(g.id);
              const Icon = g.icon;
              return (
                <Card key={g.id} className="hover:shadow-md transition-shadow border-primary/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className={`h-4 w-4 ${g.accent}`} />
                      <span className="truncate">{g.title}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">{g.description}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground gap-2 flex-wrap">
                      <span>Question-based</span>
                      {s ? (
                        <span className="inline-flex items-center gap-1" data-testid={`game-best-${g.id}`}>
                          <Trophy className="h-3 w-3" /> Best {s.bestScore} · {s.plays} play{s.plays === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">Not played yet</span>
                      )}
                    </div>
                    <Link href={`/games/${g.id}`}>
                      <Button size="sm" data-testid={`button-play-${g.id}`}>
                        {s ? "Play again" : "Play"}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <div className="grid sm:grid-cols-2 gap-4" data-tour="games-grid">
            {games.games.map((g) => {
              const s = summaryByGame.get(g.id);
              const isToday = g.id === todaysGameId;
              return (
                <Card key={g.id} className={`hover:shadow-md transition-shadow ${isToday ? "border-primary/40" : ""}`}>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <ImageIcon className="h-4 w-4 text-primary" />
                      <span className="truncate">{g.title}</span>
                      {isToday && (
                        <Badge className="ml-auto bg-primary text-primary-foreground gap-1 shrink-0">
                          <Flame className="h-3 w-3" /> Today
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground line-clamp-2">{g.description}</p>
                    <div className="flex items-center justify-between text-xs text-muted-foreground gap-2 flex-wrap">
                      <span>{g.pairs.length} cards</span>
                      {s ? (
                        <span className="inline-flex items-center gap-1" data-testid={`game-best-${g.id}`}>
                          <Trophy className="h-3 w-3" /> Best {s.bestScore} · {s.plays} play{s.plays === 1 ? "" : "s"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/70">Not played yet</span>
                      )}
                    </div>
                    <Link href={`/games/${g.id}`}>
                      <Button size="sm" variant={isToday ? "default" : "secondary"} data-testid={`button-play-${g.id}`}>
                        {s ? "Play again" : "Play"}
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
