import { useEffect, useMemo, useState } from "react";
import {
  useListDueFlashcards,
  useListAllFlashcards,
  useReviewFlashcard,
  useStartQuiz,
  useListNotebooks,
  useGenerateFlashcards,
  getListDueFlashcardsQueryKey,
  getListAllFlashcardsQueryKey,
  getGetDashboardSummaryQueryKey,
  getListQuizAttemptsQueryKey,
  getGetNotebookQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { AskAiButton } from "@/components/AskAiButton";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { useToast } from "@/hooks/use-toast";
import { Brain, ChevronLeft, ChevronRight, Eye, Layers, RotateCcw, Sparkles, CheckCheck, Target, X, Play, Wand2, Loader2 } from "lucide-react";
import { Link, useSearch, useLocation } from "wouter";
import { rememberFixItQuizId } from "@/lib/fixItPlan";

const TOUR_SAMPLE_CARD = {
  id: -1,
  front: "Which manual muscle test grade indicates full ROM against gravity with maximal resistance?",
  back: "**Grade 5 (Normal)** — Patient completes full available range of motion against gravity while holding against **maximal manual resistance**. Grade 4 (Good) holds against moderate resistance; Grade 3 (Fair) clears full ROM against gravity with no added resistance.",
};

export default function FlashcardsReview() {
  const review = useReviewFlashcard();
  const startQuiz = useStartQuiz();
  const generate = useGenerateFlashcards();
  const { data: notebooks = [] } = useListNotebooks();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [revealed, setRevealed] = useState(false);
  const [reviewedCount, setReviewedCount] = useState(0);
  const [mode, setMode] = useState<"review" | "browse">("review");
  const [browseIdx, setBrowseIdx] = useState(0);
  const [genOpen, setGenOpen] = useState(false);
  const [genForm, setGenForm] = useState({ notebookId: "", count: "10", focus: "" });
  const [tourPreview, setTourPreview] = useState<{ active: boolean; revealed: boolean } | null>(null);

  useEffect(() => {
    const onPreview = (e: Event) => {
      const detail = (e as CustomEvent<{ revealed?: boolean }>).detail;
      setTourPreview({ active: true, revealed: !!detail?.revealed });
    };
    const onReveal = (e: Event) => {
      const detail = (e as CustomEvent<{ revealed?: boolean }>).detail;
      setTourPreview((p) => ({ active: p?.active ?? true, revealed: !!detail?.revealed }));
    };
    const onEnd = () => setTourPreview(null);
    window.addEventListener("boc:tour:flashcards:preview", onPreview as EventListener);
    window.addEventListener("boc:tour:flashcards:reveal", onReveal as EventListener);
    window.addEventListener("boc:tour:flashcards:end", onEnd);
    return () => {
      window.removeEventListener("boc:tour:flashcards:preview", onPreview as EventListener);
      window.removeEventListener("boc:tour:flashcards:reveal", onReveal as EventListener);
      window.removeEventListener("boc:tour:flashcards:end", onEnd);
    };
  }, []);

  const onGenerate = () => {
    const nbId = Number(genForm.notebookId);
    if (!Number.isInteger(nbId) || nbId <= 0) {
      toast({ title: "Pick a notebook", variant: "destructive" });
      return;
    }
    const count = Math.max(1, Math.min(30, Number(genForm.count) || 10));
    generate.mutate(
      {
        id: nbId,
        data: { count, focus: genForm.focus.trim() || undefined },
      },
      {
        onSuccess: (cards) => {
          setGenOpen(false);
          setGenForm({ notebookId: "", count: "10", focus: "" });
          qc.invalidateQueries({ queryKey: getListDueFlashcardsQueryKey() });
          qc.invalidateQueries({ queryKey: getListAllFlashcardsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetNotebookQueryKey(nbId) });
          const n = Array.isArray(cards) ? cards.length : 0;
          toast({ title: `Generated ${n} flashcard${n === 1 ? "" : "s"}` });
        },
        onError: (e) =>
          toast({
            title: "Couldn't generate flashcards",
            description: e instanceof Error ? e.message : "Try again in a moment.",
            variant: "destructive",
          }),
      },
    );
  };

  const generateDialog = (
    <Dialog open={genOpen} onOpenChange={setGenOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Generate flashcards</DialogTitle>
          <DialogDescription>
            Pick a notebook to draw from. The AI will create cards from its notes and tag each one to a topic.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="gen-notebook">Notebook</Label>
            <Select
              value={genForm.notebookId}
              onValueChange={(v) => setGenForm((f) => ({ ...f, notebookId: v }))}
            >
              <SelectTrigger id="gen-notebook" data-testid="select-gen-notebook">
                <SelectValue placeholder="Choose a notebook" />
              </SelectTrigger>
              <SelectContent>
                {notebooks.map((nb) => (
                  <SelectItem key={nb.id} value={String(nb.id)}>
                    {nb.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-count">How many cards?</Label>
            <Input
              id="gen-count"
              type="number"
              min={1}
              max={30}
              value={genForm.count}
              onChange={(e) => setGenForm((f) => ({ ...f, count: e.target.value }))}
              data-testid="input-gen-count"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gen-focus">Focus (optional)</Label>
            <Textarea
              id="gen-focus"
              placeholder="e.g. ankle sprain grading, modalities indications"
              value={genForm.focus}
              onChange={(e) => setGenForm((f) => ({ ...f, focus: e.target.value }))}
              data-testid="input-gen-focus"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={generate.isPending}>
            Cancel
          </Button>
          <Button onClick={onGenerate} disabled={generate.isPending} data-testid="button-confirm-generate">
            {generate.isPending ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-1" />
            )}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  const { focusTopicIdsParam, focusTopicIds, focusRegion, thenQuiz, quizCount, fixIt } = useMemo(() => {
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
      fixIt: params.get("fixIt") === "1",
    };
  }, [search]);

  const queryParams = focusTopicIdsParam ? { topicIds: focusTopicIdsParam } : undefined;
  const { data: cards = [], isLoading } = useListDueFlashcards(queryParams, {
    query: { queryKey: getListDueFlashcardsQueryKey(queryParams), enabled: mode === "review" },
  });
  const { data: allCards = [], isLoading: isLoadingAll } = useListAllFlashcards({
    query: { queryKey: getListAllFlashcardsQueryKey(), enabled: mode === "browse" },
  });

  const liveCard = cards[0];
  const card = tourPreview?.active ? TOUR_SAMPLE_CARD : liveCard;
  const effectiveRevealed = tourPreview?.active ? tourPreview.revealed : revealed;
  const handleReveal = () => {
    if (tourPreview?.active) {
      setTourPreview({ active: true, revealed: true });
    } else {
      setRevealed(true);
    }
  };
  const handleRate = (quality: number) => {
    if (tourPreview?.active) {
      setTourPreview({ active: true, revealed: false });
      return;
    }
    submit(quality);
  };
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
          if (fixIt) rememberFixItQuizId(q.id);
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

  if (mode === "browse") {
    return (
      <>
        <BrowseMode
          cards={allCards}
          isLoading={isLoadingAll}
          idx={browseIdx}
          setIdx={setBrowseIdx}
          revealed={revealed}
          setRevealed={setRevealed}
          onExit={() => {
            setMode("review");
            setRevealed(false);
          }}
          onGenerate={() => setGenOpen(true)}
        />
        {generateDialog}
      </>
    );
  }

  if (isLoading && !tourPreview?.active) return <div className="p-6">Loading flashcards…</div>;

  if (!card) {
    return (
      <div className="flex flex-col h-full">
        <header className="h-12 border-b flex items-center justify-between px-4 gap-2">
          <h1 className="text-base font-semibold flex items-center gap-2">
            <Brain className="h-5 w-5" /> Flashcards
            {isFocused && focusRegion && (
              <Badge variant="outline" className="ml-2 text-xs flex items-center gap-1" data-testid="badge-focus-region">
                <Target className="h-3 w-3" /> {focusRegion}
              </Badge>
            )}
          </h1>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => setGenOpen(true)} data-testid="button-generate-flashcards-empty">
              <Wand2 className="h-3 w-3 mr-1" /> Generate
            </Button>
            {isFocused && (
              <Button size="sm" variant="ghost" onClick={clearFocus} data-testid="button-clear-focus">
                <X className="h-3 w-3 mr-1" /> Show all due
              </Button>
            )}
          </div>
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
                    <Button onClick={() => setGenOpen(true)} data-testid="button-generate-flashcards-empty-focused">
                      <Wand2 className="h-4 w-4 mr-1" /> Generate flashcards
                    </Button>
                    {!thenQuiz && (
                      <Link href="/notebooks">
                        <Button variant="outline" data-testid="button-go-notebooks">Go to notebooks</Button>
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
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                    <Button
                      variant="outline"
                      onClick={() => { setMode("browse"); setBrowseIdx(0); setRevealed(false); }}
                      data-testid="button-browse-all-empty"
                    >
                      <Layers className="h-4 w-4 mr-1" /> Browse all cards
                    </Button>
                    <Button onClick={() => setGenOpen(true)} data-testid="button-generate-flashcards-empty-main">
                      <Wand2 className="h-4 w-4 mr-1" /> Generate flashcards
                    </Button>
                    <Link href="/notebooks">
                      <Button variant="outline" data-testid="button-go-notebooks">Go to notebooks</Button>
                    </Link>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
        {generateDialog}
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
          <Button
            size="sm"
            variant="outline"
            onClick={() => { setMode("browse"); setBrowseIdx(0); setRevealed(false); }}
            data-testid="button-browse-all"
            title="Flip through every card without affecting the SRS schedule"
          >
            <Layers className="h-3 w-3 mr-1" /> Browse all
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setGenOpen(true)}
            data-testid="button-generate-flashcards"
            title="Generate AI flashcards from a notebook"
          >
            <Wand2 className="h-3 w-3 mr-1" /> Generate
          </Button>
          <Badge variant="outline" data-testid="badge-due-count">{cards.length} due{isFocused ? " here" : ""}</Badge>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="w-full max-w-2xl min-h-[420px] flex flex-col">
          <CardContent className="flex-1 flex flex-col p-8">
            <div className="flex items-center justify-between mb-4">
              <Badge variant="secondary" className="uppercase tracking-wide text-xs">
                {effectiveRevealed ? "Answer" : "Front"}
                {tourPreview?.active && <span className="ml-1 normal-case opacity-70">· tour preview</span>}
              </Badge>
              <AskAiButton
                context={`I'm reviewing a flashcard${focusRegion ? ` focused on ${focusRegion}` : ""}. Front: ${card.front}\nBack: ${card.back}\nExplain it deeply with clinical context.`}
                size="sm"
                variant="ghost"
              />
            </div>
            <div className="flex-1 flex items-center justify-center text-center">
              {effectiveRevealed ? (
                <div className="w-full text-left" data-testid="flashcard-content">
                  <MarkdownMessage content={card.back} className="prose-base" />
                </div>
              ) : (
                <p className="text-2xl font-medium leading-relaxed" data-testid="flashcard-content">
                  {card.front}
                </p>
              )}
            </div>
            <div className="mt-6">
              {!effectiveRevealed ? (
                <Button className="w-full" size="lg" onClick={handleReveal} data-testid="button-reveal">
                  <Eye className="h-4 w-4 mr-2" /> Reveal answer
                </Button>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  <Button variant="destructive" onClick={() => handleRate(1)} data-testid="button-rate-again">
                    <RotateCcw className="h-4 w-4 mr-1" /> Again
                  </Button>
                  <Button variant="outline" onClick={() => handleRate(3)} data-testid="button-rate-hard">Hard</Button>
                  <Button variant="secondary" onClick={() => handleRate(4)} data-testid="button-rate-good">Good</Button>
                  <Button onClick={() => handleRate(5)} data-testid="button-rate-easy">
                    <Sparkles className="h-4 w-4 mr-1" /> Easy
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {generateDialog}
    </div>
  );
}

interface BrowseCard { id: number; front: string; back: string }
interface BrowseModeProps {
  cards: BrowseCard[];
  isLoading: boolean;
  idx: number;
  setIdx: (n: number) => void;
  revealed: boolean;
  setRevealed: (b: boolean) => void;
  onExit: () => void;
  onGenerate: () => void;
}

function BrowseMode({ cards, isLoading, idx, setIdx, revealed, setRevealed, onExit, onGenerate }: BrowseModeProps) {
  const safeIdx = cards.length === 0 ? 0 : Math.min(Math.max(0, idx), cards.length - 1);
  const card = cards[safeIdx];

  const goPrev = () => {
    if (safeIdx === 0) return;
    setRevealed(false);
    setIdx(safeIdx - 1);
  };
  const goNext = () => {
    if (safeIdx >= cards.length - 1) return;
    setRevealed(false);
    setIdx(safeIdx + 1);
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 gap-3 flex-wrap">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Layers className="h-5 w-5" /> Browse all flashcards
        </h1>
        <div className="flex items-center gap-2">
          <Badge variant="outline" data-testid="badge-browse-position">
            {cards.length === 0 ? "0 of 0" : `${safeIdx + 1} of ${cards.length}`}
          </Badge>
          <Button size="sm" variant="outline" onClick={onGenerate} data-testid="button-generate-flashcards-browse">
            <Wand2 className="h-3 w-3 mr-1" /> Generate
          </Button>
          <Button size="sm" variant="ghost" onClick={onExit} data-testid="button-exit-browse">
            <X className="h-3 w-3 mr-1" /> Back to review
          </Button>
        </div>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        {isLoading ? (
          <p className="text-muted-foreground">Loading cards…</p>
        ) : !card ? (
          <Card className="max-w-md text-center">
            <CardContent className="p-10 space-y-4">
              <Brain className="h-12 w-12 mx-auto text-muted-foreground" />
              <h2 className="text-2xl font-semibold">No cards yet</h2>
              <p className="text-muted-foreground">Generate flashcards from a notebook to start a deck.</p>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={onGenerate} data-testid="button-generate-flashcards-browse-empty">
                  <Wand2 className="h-4 w-4 mr-1" /> Generate flashcards
                </Button>
                <Link href="/notebooks">
                  <Button variant="outline" data-testid="button-go-notebooks-browse">Go to notebooks</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="w-full max-w-2xl min-h-[420px] flex flex-col">
            <CardContent className="flex-1 flex flex-col p-8">
              <div className="flex items-center justify-between mb-4">
                <Badge variant="secondary" className="uppercase tracking-wide text-xs">
                  {revealed ? "Answer" : "Front"}
                </Badge>
                <span className="text-xs text-muted-foreground">Browse mode — no SRS rating</span>
              </div>
              <div className="flex-1 flex items-center justify-center text-center">
                {revealed ? (
                  <div className="w-full text-left" data-testid="flashcard-browse-content">
                    <MarkdownMessage content={card.back} className="prose-base" />
                  </div>
                ) : (
                  <p className="text-2xl font-medium leading-relaxed" data-testid="flashcard-browse-content">
                    {card.front}
                  </p>
                )}
              </div>
              <div className="mt-6 flex items-center justify-between gap-2">
                <Button variant="outline" onClick={goPrev} disabled={safeIdx === 0} data-testid="button-browse-prev">
                  <ChevronLeft className="h-4 w-4 mr-1" /> Previous
                </Button>
                <Button variant="default" onClick={() => setRevealed(!revealed)} data-testid="button-browse-flip">
                  <Eye className="h-4 w-4 mr-2" /> {revealed ? "Show front" : "Reveal answer"}
                </Button>
                <Button variant="outline" onClick={goNext} disabled={safeIdx >= cards.length - 1} data-testid="button-browse-next">
                  Next <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
