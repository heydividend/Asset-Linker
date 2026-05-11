import { useMemo, useState } from "react";
import {
  useListDueFlashcards,
  useReviewFlashcard,
  useStartQuiz,
  getListDueFlashcardsQueryKey,
  getGetDashboardSummaryQueryKey,
  getListQuizAttemptsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AskAiButton } from "@/components/AskAiButton";
import { useToast } from "@/hooks/use-toast";
import { Brain, Eye, RotateCcw, Sparkles, CheckCheck, Target, X, Play } from "lucide-react";
import { Link, useSearch, useLocation } from "wouter";

export default function FlashcardsReview() {
  const review = useReviewFlashcard();
  const startQuiz = useStartQuiz();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);

  const { focusTopicIdsParam, focusTopicIds, focusRegion, thenQuiz, quizCount } = useMemo(() => {
    const params = new URLSearchParams(search);
    const raw = params.get("topicIds") ?? "";
    const ids = raw
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);
    const cnt = Number(params.get("quizCount"));
    return {
      focusTopicIdsParam: ids.length > 0 ? ids.join(",") : undefined,
      focusTopicIds: ids,
      focusRegion: params.get("region"),
      thenQuiz: params.get("thenQuiz") === "1",
      quizCount: Number.isFinite(cnt) && cnt > 0 ? Math.min(50, cnt) : 10,
    };
  }, [search]);

  const queryParams = focusTopicIdsParam ? { topicIds: focusTopicIdsParam } : undefined;
  const { data: cards = [], isLoading } = useListDueFlashcards(queryParams, {
    query: { queryKey: getListDueFlashcardsQueryKey(queryParams) },
  });

  const card = cards[0];
  // Only treat as focused when we actually have topic IDs constraining the
  // server query — a stray `region` param alone would otherwise show focused
  // UI while loading every due card.
  const isFocused = !!focusTopicIdsParam;

  const clearFocus = () => navigate("/flashcards");

  const launchMixedQuiz = () => {
    if (focusTopicIds.length === 0) return;
    startQuiz.mutate(
      { data: { mode: "region", count: quizCount, topicIds: focusTopicIds } },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          navigate(`/quiz/${q.id}`);
        },
        onError: (e) => {
          toast({
            title: "Couldn't start the mixed quiz",
            description: e instanceof Error ? e.message : "Try again from the quiz hub.",
            variant: "destructive",
          });
        },
      },
    );
  };

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
        <header className="h-12 border-b flex items-center justify-between px-4">
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5" /> Flashcards
            {isFocused && focusRegion && (
              <Badge variant="outline" className="ml-2 text-xs flex items-center gap-1" data-testid="badge-focus-region">
                <Target className="h-3 w-3" /> {focusRegion}
              </Badge>
            )}
          </h1>
          {isFocused && (
            <Button size="sm" variant="ghost" onClick={clearFocus} data-testid="button-clear-focus">
              <X className="h-3 w-3 mr-1" /> Show all due
            </Button>
          )}
        </header>
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-md text-center">
            <CardContent className="p-10 space-y-4">
              <CheckCheck className="h-12 w-12 mx-auto text-primary" />
              <h2 className="text-2xl font-semibold">All caught up</h2>
              {isFocused ? (
                <>
                  <p className="text-muted-foreground">
                    {reviewedCount > 0
                      ? `You reviewed ${reviewedCount} ${focusRegion ?? "focused"} card${reviewedCount === 1 ? "" : "s"}. Nothing else due for this region.`
                      : `No due flashcards are tagged to ${focusRegion ?? "this region"} yet.`}
                  </p>
                  {thenQuiz ? (
                    <p className="text-sm text-muted-foreground">
                      Next up: a {quizCount}-question mixed quiz across the same topics.
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Generate flashcards from a notebook and tag them to the region's topics to grow this stack.
                    </p>
                  )}
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                    {thenQuiz && (
                      <Button
                        onClick={launchMixedQuiz}
                        disabled={startQuiz.isPending}
                        data-testid="button-launch-mixed-quiz"
                      >
                        <Play className="h-4 w-4 mr-1" /> Start {quizCount}-question mixed quiz
                      </Button>
                    )}
                    <Button variant="outline" onClick={clearFocus} data-testid="button-empty-clear-focus">
                      Review all due cards
                    </Button>
                    {!thenQuiz && (
                      <Link href="/notebooks">
                        <Button data-testid="button-go-notebooks">Go to notebooks</Button>
                      </Link>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p className="text-muted-foreground">
                    {reviewedCount > 0 ? `Nice — you reviewed ${reviewedCount} card${reviewedCount === 1 ? "" : "s"}.` : "No cards are due right now."}
                  </p>
                  <p className="text-sm text-muted-foreground">Generate more cards from a notebook to keep your spaced-repetition stack growing.</p>
                  <Link href="/notebooks">
                    <Button data-testid="button-go-notebooks">Go to notebooks</Button>
                  </Link>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 gap-3 flex-wrap">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Brain className="h-5 w-5" /> Flashcards
          {isFocused && focusRegion && (
            <Badge variant="outline" className="ml-2 text-xs flex items-center gap-1" data-testid="badge-focus-region">
              <Target className="h-3 w-3" /> {focusRegion}
            </Badge>
          )}
        </h1>
        <div className="flex items-center gap-2">
          {thenQuiz && isFocused && (
            <Button
              size="sm"
              variant="outline"
              onClick={launchMixedQuiz}
              disabled={startQuiz.isPending}
              data-testid="button-skip-to-quiz"
              title="Skip ahead and take the mixed quiz now"
            >
              <Play className="h-3 w-3 mr-1" /> Skip to quiz
            </Button>
          )}
          {isFocused && (
            <Button size="sm" variant="ghost" onClick={clearFocus} data-testid="button-clear-focus">
              <X className="h-3 w-3 mr-1" /> Show all due
            </Button>
          )}
          <Badge variant="outline" data-testid="badge-due-count">{cards.length} due{isFocused ? " here" : ""}</Badge>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl min-h-[420px] flex flex-col">
          <CardContent className="flex-1 flex flex-col p-8">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="secondary" className="uppercase tracking-wide text-xs">
                {revealed ? "Answer" : "Front"}
              </Badge>
              <AskAiButton
                context={`I'm reviewing a flashcard${focusRegion ? ` focused on ${focusRegion}` : ""}. Front: ${card.front}\nBack: ${card.back}\nExplain it deeply with clinical context.`}
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
