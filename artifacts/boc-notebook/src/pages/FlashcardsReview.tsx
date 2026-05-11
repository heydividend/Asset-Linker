import { useState } from "react";
import { useListDueFlashcards, useReviewFlashcard, getListDueFlashcardsQueryKey, getGetDashboardSummaryQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AskAiButton } from "@/components/AskAiButton";
import { Brain, Eye, RotateCcw, Sparkles, CheckCheck } from "lucide-react";
import { Link } from "wouter";

export default function FlashcardsReview() {
  const { data: cards = [], isLoading } = useListDueFlashcards({ query: { queryKey: getListDueFlashcardsQueryKey() } });
  const review = useReviewFlashcard();
  const qc = useQueryClient();
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const card = cards[0];

  const submit = (quality: number) => {
    if (!card) return;
    review.mutate(
      { id: card.id, data: { quality } },
      {
        onSuccess: () => {
          setRevealed(false);
          setReviewedCount((c) => c + 1);
          qc.invalidateQueries({ queryKey: getListDueFlashcardsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      },
    );
  };

  if (isLoading) return <div className="p-6">Loading flashcards…</div>;

  if (!card) {
    return (
      <div className="flex flex-col h-full">
        <header className="h-14 border-b flex items-center px-6">
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5" /> Flashcards
          </h1>
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardContent className="p-10 space-y-4">
              <CheckCheck className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-semibold">All caught up</h2>
              <p className="text-muted-foreground">
                {reviewedCount > 0 ? `Nice — you reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"}.` : "No cards are due right now."}
              </p>
              <p className="text-sm text-muted-foreground">Generate more cards from a notebook to keep your spaced-repetition stack growing.</p>
              <Link href="/notebooks">
                <Button data-testid="button-go-notebooks">Go to notebooks</Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center justify-between px-6">
        <h1 className="text-lg font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5" /> Flashcards
        </h1>
        <Badge variant="outline" data-testid="badge-due-count">{cards.length} due</Badge>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl min-h-[420px] flex flex-col">
          <CardContent className="flex-1 flex flex-col p-8">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="secondary" className="uppercase tracking-wide text-xs">
                {revealed ? "Answer" : "Front"}
              </Badge>
              <AskAiButton
                context={`I'm reviewing a flashcard. Front: ${card.front}\nBack: ${card.back}\nExplain it deeply with clinical context.`}
                size="sm"
                variant="ghost"
              />
            </div>
            <div className="flex-1 flex items-center justify-center text-center">
              <p className="text-2xl font-medium leading-relaxed" data-testid="flashcard-content">
                {revealed ? card.back : card.front}
              </p>
            </div>
            <div className="mt-6">
              {!revealed ? (
                <Button className="w-full" size="lg" onClick={() => setRevealed(true)} data-testid="button-reveal">
                  <Eye className="h-4 w-4 mr-2" /> Reveal answer
                </Button>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  <Button variant="destructive" onClick={() => submit(1)} data-testid="button-rate-again">
                    <RotateCcw className="h-4 w-4 mr-1" /> Again
                  </Button>
                  <Button variant="outline" onClick={() => submit(3)} data-testid="button-rate-hard">Hard</Button>
                  <Button variant="secondary" onClick={() => submit(4)} data-testid="button-rate-good">Good</Button>
                  <Button onClick={() => submit(5)} data-testid="button-rate-easy">
                    <Sparkles className="h-4 w-4 mr-1" /> Easy
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
