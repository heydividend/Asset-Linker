import { useEffect, useMemo, useState } from "react";
import {
  useListDueFlashcards,
  useListAllFlashcards,
  useReviewFlashcard,
  useGradeFlashcardAnswer,
  useGetFlashcardChoices,
  useStartQuiz,
  useListNotebooks,
  useGenerateFlashcards,
  getListDueFlashcardsQueryKey,
  getListAllFlashcardsQueryKey,
  getGetDashboardSummaryQueryKey,
  getListQuizAttemptsQueryKey,
  getGetNotebookQueryKey,
} from "@workspace/api-client-react";
import type { FlashcardGradeResult, FlashcardChoices } from "@workspace/api-client-react";
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
import { Brain, ChevronLeft, ChevronRight, Eye, Layers, RotateCcw, Sparkles, CheckCheck, Target, X, Play, Wand2, Loader2, Pencil, Send, ThumbsUp, ThumbsDown, MinusCircle, ListChecks, Check } from "lucide-react";
import { Link, useSearch, useLocation } from "wouter";
import { rememberFixItQuizId } from "@/lib/fixItPlan";

const TOUR_SAMPLE_CARD = {
  id: -1,
  front: "Which manual muscle test grade indicates full ROM against gravity with maximal resistance?",
  back: "**Grade 5 (Normal)** — Patient completes full available range of motion against gravity while holding against **maximal manual resistance**. Grade 4 (Good) holds against moderate resistance; Grade 3 (Fair) clears full ROM against gravity with no added resistance.",
};

export default function FlashcardsReview() {
  const review = useReviewFlashcard();
  const grade = useGradeFlashcardAnswer();
  const fetchChoices = useGetFlashcardChoices();
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
  // "Type your answer" flow: when answering=true we show a textarea + Submit
  // button instead of (or before) the Reveal button. After submit, the AI
  // grader returns a verdict + feedback that we display alongside the back.
  const [answering, setAnswering] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState("");
  const [gradeResult, setGradeResult] = useState<FlashcardGradeResult | null>(null);
  // Multiple-choice mode: AI generates 3 options (1 correct, 2 distractors).
  // mcChoices is null until the user picks "Multiple choice" and the AI returns;
  // mcPicked records which index they chose so we can highlight right/wrong.
  const [mcChoices, setMcChoices] = useState<FlashcardChoices | null>(null);
  const [mcPicked, setMcPicked] = useState<number | null>(null);

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

  // Reset typed-answer state whenever the active card changes so the previous
  // card's textarea/feedback don't leak into the next card.
  useEffect(() => {
    setAnswering(false);
    setTypedAnswer("");
    setGradeResult(null);
    setMcChoices(null);
    setMcPicked(null);
  }, [card?.id]);

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
          setAnswering(false);
          setTypedAnswer("");
          setGradeResult(null);
          setMcChoices(null);
          setMcPicked(null);
          setReviewedCount((c) => c + 1);
          qc.invalidateQueries({ queryKey: getListDueFlashcardsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      },
    );
  };

  const startMultipleChoice = () => {
    if (!card) return;
    if (tourPreview?.active) {
      // Tour mode: fake 3 options so the walkthrough doesn't depend on the AI.
      setMcChoices({
        choices: [
          "Grade 5 (Normal) — full ROM against gravity with maximal resistance",
          "Grade 3 (Fair) — full ROM against gravity with no resistance",
          "Grade 4 (Good) — full ROM against gravity with moderate resistance",
        ],
        correctIndex: 0,
        back: card.back,
      });
      return;
    }
    fetchChoices.mutate(
      { id: card.id },
      {
        onSuccess: (result) => {
          setMcChoices(result);
        },
        onError: (e) => {
          toast({
            title: "Couldn't build multiple choice",
            description: e instanceof Error ? e.message : "Try again or use type/reveal.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const pickChoice = (idx: number) => {
    if (mcPicked != null) return; // lock after first pick
    setMcPicked(idx);
    if (tourPreview?.active) {
      setTourPreview({ active: true, revealed: true });
    } else {
      setRevealed(true);
    }
  };

  const submitTypedAnswer = () => {
    if (!card || !typedAnswer.trim()) return;
    if (tourPreview?.active) {
      // Tour mode: don't actually call AI — just simulate a "correct" verdict
      // so the user can see the flow during the guided walkthrough.
      setGradeResult({
        verdict: "correct",
        score: 92,
        feedback:
          "Nice work — your answer captured the key idea. **Grade 5 (Normal)** is the gold standard for full ROM against gravity with **maximal resistance**.",
        suggestedQuality: 4,
        back: card.back,
      });
      setTourPreview({ active: true, revealed: true });
      return;
    }
    grade.mutate(
      { id: card.id, data: { answer: typedAnswer.trim() } },
      {
        onSuccess: (result) => {
          setGradeResult(result);
          setRevealed(true);
        },
        onError: (e) => {
          toast({
            title: "Couldn't grade your answer",
            description: e instanceof Error ? e.message : "Try again or just reveal the card.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const cancelAnswering = () => {
    setAnswering(false);
    setTypedAnswer("");
    setGradeResult(null);
  };

  const cancelMultipleChoice = () => {
    setMcChoices(null);
    setMcPicked(null);
  };

  const mcSuggestedQuality = mcChoices && mcPicked != null
    ? mcPicked === mcChoices.correctIndex
      ? 4
      : 1
    : null;

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
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
              {/* Always show the question at the top of the card */}
              <p
                className={`leading-relaxed ${effectiveRevealed ? "text-base font-medium text-muted-foreground" : "text-2xl font-medium"}`}
                data-testid="flashcard-content"
              >
                {card.front}
              </p>

              {/* Typed-answer panel (before grading) */}
              {answering && !gradeResult && (
                <div className="w-full text-left space-y-2">
                  <Label htmlFor="typed-answer" className="text-xs uppercase tracking-wider text-muted-foreground">
                    Your answer
                  </Label>
                  <Textarea
                    id="typed-answer"
                    autoFocus
                    rows={4}
                    placeholder="Type what you remember — full sentences, key terms, or bullet points all work."
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                        e.preventDefault();
                        submitTypedAnswer();
                      }
                    }}
                    data-testid="textarea-typed-answer"
                  />
                  <p className="text-xs text-muted-foreground">
                    Press <kbd className="rounded border bg-muted px-1">⌘</kbd> /{" "}
                    <kbd className="rounded border bg-muted px-1">Ctrl</kbd> +{" "}
                    <kbd className="rounded border bg-muted px-1">Enter</kbd> to submit.
                  </p>
                </div>
              )}

              {/* Multiple-choice picker (before reveal). Shown when the user
                  asked for choices; locks after the first pick. */}
              {!effectiveRevealed && mcChoices && (
                <div className="w-full text-left space-y-2">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">
                    Pick the correct answer
                  </p>
                  <div className="grid gap-2">
                    {mcChoices.choices.map((choice, idx) => {
                      const picked = mcPicked === idx;
                      const isCorrect = idx === mcChoices.correctIndex;
                      const showState = mcPicked != null;
                      const variant = !showState
                        ? "outline"
                        : isCorrect
                          ? "default"
                          : picked
                            ? "destructive"
                            : "outline";
                      return (
                        <Button
                          key={idx}
                          variant={variant}
                          className="justify-start text-left whitespace-normal h-auto py-3"
                          disabled={mcPicked != null}
                          onClick={() => pickChoice(idx)}
                          data-testid={`button-mc-choice-${idx}`}
                        >
                          <span className="mr-2 font-semibold">{String.fromCharCode(65 + idx)}.</span>
                          <span className="flex-1">{choice}</span>
                          {showState && isCorrect && <Check className="h-4 w-4 ml-2 shrink-0" />}
                          {showState && picked && !isCorrect && (
                            <X className="h-4 w-4 ml-2 shrink-0" />
                          )}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Loading state while AI generates choices */}
              {!effectiveRevealed && !mcChoices && fetchChoices.isPending && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Building 3 options...
                </div>
              )}

              {/* AI grading result + official answer */}
              {effectiveRevealed && (
                <div className="w-full text-left space-y-3">
                  {gradeResult && (
                    <GradeResultPanel result={gradeResult} typedAnswer={typedAnswer} />
                  )}
                  {mcChoices && mcPicked != null && (
                    <div
                      className={`rounded-md border p-3 text-sm ${
                        mcPicked === mcChoices.correctIndex
                          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950"
                          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
                      }`}
                      data-testid="mc-result-panel"
                    >
                      <p className="font-medium">
                        {mcPicked === mcChoices.correctIndex
                          ? "Correct!"
                          : `Not quite — you picked ${String.fromCharCode(65 + mcPicked)}, correct was ${String.fromCharCode(65 + mcChoices.correctIndex)}.`}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                      Official answer
                    </p>
                    <MarkdownMessage content={card.back} className="prose-base" />
                  </div>
                </div>
              )}
            </div>
            <div className="mt-6">
              {!effectiveRevealed && !answering && !mcChoices ? (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={startMultipleChoice}
                    disabled={fetchChoices.isPending}
                    data-testid="button-multiple-choice"
                  >
                    {fetchChoices.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <ListChecks className="h-4 w-4 mr-2" />
                    )}
                    Multiple choice
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => setAnswering(true)}
                    data-testid="button-answer"
                  >
                    <Pencil className="h-4 w-4 mr-2" /> Type my answer
                  </Button>
                  <Button size="lg" onClick={handleReveal} data-testid="button-reveal">
                    <Eye className="h-4 w-4 mr-2" /> Just reveal
                  </Button>
                </div>
              ) : !effectiveRevealed && mcChoices ? (
                <div className="flex justify-end">
                  <Button
                    variant="ghost"
                    onClick={cancelMultipleChoice}
                    data-testid="button-cancel-mc"
                  >
                    Cancel
                  </Button>
                </div>
              ) : answering && !gradeResult ? (
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    variant="ghost"
                    onClick={cancelAnswering}
                    disabled={grade.isPending}
                    data-testid="button-cancel-answer"
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Skip grading entirely — bail out of typing mode and
                      // jump straight to the official answer + SM-2 ratings.
                      setAnswering(false);
                      setTypedAnswer("");
                      setGradeResult(null);
                      handleReveal();
                    }}
                    disabled={grade.isPending}
                    data-testid="button-skip-to-reveal"
                  >
                    <Eye className="h-4 w-4 mr-1" /> Show answer
                  </Button>
                  <Button
                    onClick={submitTypedAnswer}
                    disabled={grade.isPending || !typedAnswer.trim()}
                    data-testid="button-submit-answer"
                  >
                    {grade.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-1" />
                    )}
                    Submit
                  </Button>
                </div>
              ) : (
                (() => {
                  const suggested = gradeResult?.suggestedQuality ?? mcSuggestedQuality;
                  return (
                    <div className="grid grid-cols-4 gap-2">
                      <Button
                        variant={suggested === 1 ? "destructive" : "outline"}
                        onClick={() => handleRate(1)}
                        data-testid="button-rate-again"
                      >
                        <RotateCcw className="h-4 w-4 mr-1" /> Again
                      </Button>
                      <Button
                        variant={suggested === 3 ? "default" : "outline"}
                        onClick={() => handleRate(3)}
                        data-testid="button-rate-hard"
                      >
                        Hard
                      </Button>
                      <Button
                        variant={suggested === 4 ? "default" : "secondary"}
                        onClick={() => handleRate(4)}
                        data-testid="button-rate-good"
                      >
                        Good
                      </Button>
                      <Button
                        variant={suggested === 5 ? "default" : "outline"}
                        onClick={() => handleRate(5)}
                        data-testid="button-rate-easy"
                      >
                        <Sparkles className="h-4 w-4 mr-1" /> Easy
                      </Button>
                    </div>
                  );
                })()
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      {generateDialog}
    </div>
  );
}

function GradeResultPanel({
  result,
  typedAnswer,
}: {
  result: FlashcardGradeResult;
  typedAnswer: string;
}) {
  const tone =
    result.verdict === "correct"
      ? {
          wrap: "border-emerald-500/40 bg-emerald-500/5",
          label: "text-emerald-700",
          Icon: ThumbsUp,
          title: "Correct",
        }
      : result.verdict === "partial"
      ? {
          wrap: "border-amber-500/40 bg-amber-500/5",
          label: "text-amber-700",
          Icon: MinusCircle,
          title: "Partially correct",
        }
      : {
          wrap: "border-rose-500/40 bg-rose-500/5",
          label: "text-rose-700",
          Icon: ThumbsDown,
          title: "Not quite",
        };
  const { Icon } = tone;
  return (
    <div className={`rounded-lg border p-3 ${tone.wrap}`} data-testid={`grade-${result.verdict}`}>
      <div className={`flex items-center justify-between gap-2 mb-2 ${tone.label}`}>
        <div className="flex items-center gap-1.5 font-semibold text-sm">
          <Icon className="h-4 w-4" /> {tone.title}
        </div>
        <Badge variant="outline" className={`${tone.label} border-current`} data-testid="grade-score">
          {result.score}/100
        </Badge>
      </div>
      {typedAnswer && (
        <div className="mb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
            Your answer
          </p>
          <p className="text-sm whitespace-pre-wrap text-foreground/90">{typedAnswer}</p>
        </div>
      )}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-0.5">
          Tutor feedback
        </p>
        <MarkdownMessage content={result.feedback} className="prose-sm" />
      </div>
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
