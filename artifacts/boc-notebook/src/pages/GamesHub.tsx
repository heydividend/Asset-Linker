import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gamepad2, Image as ImageIcon } from "lucide-react";
import games from "@/data/games.json";

export default function GamesHub() {
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4 gap-2 bg-background">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Gamepad2 className="h-5 w-5" /> Games
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-4xl mx-auto grid sm:grid-cols-2 gap-4">
          {games.games.map((g) => (
            <Card key={g.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ImageIcon className="h-4 w-4 text-primary" />
                  {g.title}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{g.description}</p>
                <p className="text-xs text-muted-foreground">{g.pairs.length} cards</p>
                <Link href={`/games/${g.id}`}>
                  <Button size="sm" data-testid={`button-play-${g.id}`}>Play</Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
