import { useParams, Link, useSearch, useLocation } from "wouter";
import { useEffect, useMemo, useRef, useState } from "react";
import { forgetFixItQuizId, isTodayFixItQuiz, markCompletedToday } from "@/lib/fixItPlan";
import {
  useGetQuiz,
  useAnswerQuizQuestion,
  useFinishQuiz,
  useGetDashboardTopicMastery,
  getGetQuizQueryKey,
  getGetDashboardTopicMasteryQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetFixItStreakQueryKey,
  type GetQuizQueryResult,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AskAiButton } from "@/components/AskAiButton";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { StudyCoachTip } from "@/components/StudyCoachTip";
import { MasterySparkline, type SparklineAttempt } from "@/components/MasterySparkline";
import { Progress } from "@/components/ui/progress";
import { AlertTriangle, Check, ChevronRight, ExternalLink, LogOut, Trophy, Users, X } from "lucide-react";

function arraysEqualAsSets(a: number[] | null | undefined, b: number[] | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  const sa = [...a].sort((x, y) => x - y);
  const sb = [...b].sort((x, y) => x - y);
  return sa.every((v, i) => v === sb[i]);
}

function isQuestionCorrect(qq: { multiSelect?: boolean; selectedIndex?: number | null; correctIndex?: number | null; selectedIndices?: number[] | null; correctIndices?: number[] | null }): boolean {
  if (qq.multiSelect) return arraysEqualAsSets(qq.selectedIndices ?? null, qq.correctIndices ?? null);
  return qq.selectedIndex != null && qq.selectedIndex === qq.correctIndex;
}

export default function QuizRunner() {
  const params = useParams();
  const id = Number(params.id);
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [tourActive, setTourActive] = useState<boolean>(() =>
    typeof window !== "undefined" &&
    !!(window as unknown as { __bocTourQuizRunPreview?: boolean }).__bocTourQuizRunPreview,
  );

  useEffect(() => {
    const onPreview = () => setTourActive(true);
    const onEnd = () => {
      setTourActive(false);
      // Leave the sentinel /quiz/0 route once the tour ends.
      if (window.location.pathname.endsWith("/quiz/0")) {
        navigate("/quiz");
      }
    };
    window.addEventListener("boc:tour:quizrun:preview", onPreview);
    window.addEventListener("boc:tour:quizrun:end", onEnd);
    return () => {
      window.removeEventListener("boc:tour:quizrun:preview", onPreview);
      window.removeEventListener("boc:tour:quizrun:end", onEnd);
    };
  }, [navigate]);

  const realQuizId = Number.isInteger(id) && id > 0;
  const { data: quiz, isLoading } = useGetQuiz(id, {
    query: { enabled: realQuizId && !tourActive, queryKey: getGetQuizQueryKey(id) },
  });
  const answer = useAnswerQuizQuestion();
  const finish = useFinishQuiz();
  const [localIdx, setLocalIdx] = useState<number | null>(null);
  const [multiPicks, setMultiPicks] = useState<Record<number, number[]>>({});
  const [submittingMulti, setSubmittingMulti] = useState(false);

  const onExit = () => {
    if (!confirm("Exit this quiz? Your answers so far are saved — you can resume later from the Practice page.")) return;
    navigate("/quiz");
  };

  if (tourActive) return <TourSampleQuizView />;

  if (isLoading || !quiz) return <div className="p-6">Loading quiz…</div>;

  const total = quiz.questions.length;
  const rawIdx = localIdx ?? quiz.currentIndex;
  // Server may advance currentIndex past the last question once it's answered;
  // clamp to the last valid index so the user can still see the rationale and finish.
  const idx = Math.min(Math.max(0, rawIdx), Math.max(0, total - 1));
  const q = quiz.questions[idx];
  const isAnsweredQuestion = (qq: { multiSelect?: boolean; selectedIndex?: number | null; selectedIndices?: number[] | null }) => {
    if (qq.multiSelect) return Array.isArray(qq.selectedIndices);
    return qq.selectedIndex != null;
  };
  const allAnswered = quiz.questions.every((qq) => isAnsweredQuestion(qq));
  const finished = quiz.finished;

  const isAnsweredQ = (qq: typeof q) => {
    if (!qq) return false;
    if (qq.multiSelect) return Array.isArray(qq.selectedIndices);
    return qq.selectedIndex != null;
  };

  const onPick = (choiceIdx: number) => {
    if (!q || isAnsweredQ(q)) return;
    if (q.multiSelect) {
      setMultiPicks((p) => {
        const cur = p[q.questionId] ?? [];
        const next = cur.includes(choiceIdx) ? cur.filter((c) => c !== choiceIdx) : [...cur, choiceIdx];
        return { ...p, [q.questionId]: next };
      });
      return;
    }
    answer.mutate(
      { id: quiz.id, data: { questionId: q.questionId, selectedIndex: choiceIdx } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetQuizQueryKey(id) }) },
    );
  };

  const onSubmitMulti = async () => {
    if (!q || !q.multiSelect || isAnsweredQ(q)) return;
    const picks = multiPicks[q.questionId] ?? [];
    if (picks.length === 0) return;
    setSubmittingMulti(true);
    try {
      await fetch(`/api/quizzes/${quiz.id}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: q.questionId, selectedIndices: picks }),
      });
      await qc.invalidateQueries({ queryKey: getGetQuizQueryKey(id) });
    } finally {
      setSubmittingMulti(false);
    }
  };

  const onFinish = () => {
    const wasFixItToday = isTodayFixItQuiz(quiz.id);
    finish.mutate(
      { id: quiz.id },
      {
        onSuccess: () => {
          if (wasFixItToday) {
            markCompletedToday();
            forgetFixItQuizId(quiz.id);
            qc.invalidateQueries({ queryKey: getGetFixItStreakQueryKey() });
          }
          qc.invalidateQueries({ queryKey: getGetQuizQueryKey(id) });
          qc.invalidateQueries({ queryKey: getGetDashboardTopicMasteryQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        },
      },
    );
  };

  if (finished) {
    const correct = quiz.questions.filter((qq) => isQuestionCorrect(qq)).length;
    const pct = Math.round((correct / total) * 100);
    return <FinishedQuizView quiz={quiz} correct={correct} pct={pct} total={total} />;
  }

  if (!q) return <div className="p-6">No question.</div>;

  const answered = isAnsweredQuestion(q);
  const currentMultiPicks = q.multiSelect ? (multiPicks[q.questionId] ?? []) : [];
  const isCorrect = answered && isQuestionCorrect(q);

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center px-6 gap-4">
        <h1 className="text-lg font-semibold">Question {idx + 1} of {total}</h1>
        <Progress value={((idx + 1) / total) * 100} className="flex-1 h-2 max-w-xs" />
        <Button variant="ghost" size="sm" onClick={onExit} data-testid="button-exit-quiz" title="Save progress and exit — you can resume later">
          <LogOut className="h-4 w-4 mr-1" /> Exit
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        {!answered && <StudyCoachTip context="quiz-pick" />}
        {answered && (
          <StudyCoachTip
            context={isCorrect ? "quiz-review-right" : "quiz-review-wrong"}
            askAiContext={
              isCorrect
                ? `I answered this BOC quiz item correctly. Stress-test my reasoning — could the distractors trick me on a similar item?\nQ: ${q.stem}\nMy answer: ${q.choices[q.selectedIndex ?? 0]}\nRationale: ${q.rationale ?? "n/a"}`
                : `I missed this BOC quiz item. Name the trap I fell for and give me a one-line cue I can use next time.\nQ: ${q.stem}\nMy answer: ${q.choices[q.selectedIndex ?? 0]}\nCorrect: ${q.choices[q.correctIndex ?? 0]}\nRationale: ${q.rationale ?? "n/a"}`
            }
          />
        )}
        <Card>
          <CardHeader>
            {(q.sourceKind === "study_group" || q.pendingReview) && (
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {q.sourceKind === "study_group" && (
                  <Badge
                    variant="outline"
                    className="text-[11px] px-1.5 py-0 flex items-center gap-1"
                    data-testid="badge-question-source-study-group"
                  >
                    <Users className="h-3 w-3" /> From study group
                  </Badge>
                )}
                {q.pendingReview && (
                  <Badge
                    variant="outline"
                    className="text-[11px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-300 flex items-center gap-1"
                    data-testid="badge-question-pending-review"
                  >
                    <AlertTriangle className="h-3 w-3" /> Pending review
                  </Badge>
                )}
              </div>
            )}
            <CardTitle className="text-lg leading-relaxed" data-testid="text-question-stem">{q.stem}</CardTitle>
            {q.imageUrl && (
              <img
                src={q.imageUrl}
                alt="Question figure"
                className="mt-3 max-h-72 w-auto rounded-md border bg-muted/30 object-contain"
                data-testid="img-question"
              />
            )}
          </CardHeader>
          <CardContent className="space-y-2">
            {q.multiSelect && (
              <p className="text-sm font-medium text-muted-foreground mb-2">Select all that apply.</p>
            )}
            {q.choices.map((c, ci) => {
              const correctSet = q.multiSelect ? (q.correctIndices ?? []) : [q.correctIndex];
              const pickedSet = q.multiSelect ? (q.selectedIndices ?? currentMultiPicks) : [q.selectedIndex];
              const isPicked = pickedSet.includes(ci);
              const isCorrectChoice = correctSet.includes(ci);
              const showCorrect = answered && isCorrectChoice;
              const showWrong = answered && isPicked && !isCorrectChoice;
              const showPickedPreview = !answered && q.multiSelect && currentMultiPicks.includes(ci);
              return (
                <button
                  key={ci}
                  onClick={() => onPick(ci)}
                  disabled={answered}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    showCorrect
                      ? "border-primary bg-primary/10"
                      : showWrong
                        ? "border-destructive bg-destructive/10"
                        : answered
                          ? "border-border opacity-60"
                          : showPickedPreview
                            ? "border-primary bg-primary/5"
                            : "border-border hover-elevate cursor-pointer"
                  }`}
                  data-testid={`choice-${ci}`}
                >
                  {q.multiSelect && (
                    <span className={`inline-flex items-center justify-center w-5 h-5 mr-2 rounded border ${showPickedPreview || showCorrect || (answered && isPicked) ? "border-primary bg-primary/20" : "border-border"}`}>
                      {(showPickedPreview || (answered && isPicked) || showCorrect) && <Check className="h-3 w-3" />}
                    </span>
                  )}
                  <span className="font-medium mr-2">{String.fromCharCode(65 + ci)}.</span>
                  {c}
                </button>
              );
            })}
            {q.multiSelect && !answered && (
              <Button
                onClick={onSubmitMulti}
                disabled={currentMultiPicks.length === 0 || submittingMulti}
                className="mt-2"
                data-testid="button-submit-multi"
              >
                Submit answer
              </Button>
            )}
          </CardContent>
        </Card>

        {answered && (
          <Card className={isCorrect ? "border-primary" : "border-destructive"}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                {isCorrect ? <Check className="h-5 w-5 text-primary" /> : <X className="h-5 w-5 text-destructive" />}
                <span className="font-semibold">{isCorrect ? "Correct" : "Not quite"}</span>
              </div>
              {q.rationale && <MarkdownMessage content={q.rationale} />}
              <div className="flex items-center gap-2 flex-wrap">
                {q.sourceUrl && (
                  <a href={q.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                    <ExternalLink className="h-3 w-3" /> Source
                  </a>
                )}
                <AskAiButton context={`Explain this BOC question in depth:\nQ: ${q.stem}\nCorrect answer: ${q.choices[q.correctIndex ?? 0]}\nRationale: ${q.rationale ?? "n/a"}`} size="sm" />
              </div>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-between">
          <span />
          {answered && (
            idx + 1 < total ? (
              <Button onClick={() => setLocalIdx(idx + 1)} data-testid="button-next-question">
                Next <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : allAnswered ? (
              <Button onClick={onFinish} disabled={finish.isPending} data-testid="button-finish-quiz">Finish quiz</Button>
            ) : (
              <Button onClick={() => setLocalIdx(quiz.questions.findIndex((qq) => qq.selectedIndex == null))} data-testid="button-skip-to-unanswered">
                Go to unanswered
              </Button>
            )
          )}
        </div>
      </div>
    </div>
  );
}

interface FinishedQuizViewProps {
  quiz: GetQuizQueryResult;
  correct: number;
  pct: number;
  total: number;
}

function FinishedQuizView({ quiz, correct, pct, total }: FinishedQuizViewProps) {
  // When the user opens this attempt from a recent-trend popover, the URL
  // carries `?q=<questionId>` so we can scroll to and briefly highlight the
  // exact question they tapped (Task #45).
  const search = useSearch();
  const focusQuestionId = (() => {
    const raw = new URLSearchParams(search).get("q");
    const n = raw == null ? NaN : Number(raw);
    return Number.isFinite(n) ? n : null;
  })();
  const focusedRef = useRef<HTMLDivElement | null>(null);
  const [highlightedQuestionId, setHighlightedQuestionId] = useState<number | null>(null);
  const lastScrolledKey = useRef<string | null>(null);

  useEffect(() => {
    if (focusQuestionId == null) return;
    const exists = quiz.questions.some((qq) => qq.questionId === focusQuestionId);
    if (!exists) return;
    const key = `${quiz.id}:${focusQuestionId}`;
    if (lastScrolledKey.current === key) return;
    lastScrolledKey.current = key;
    const node = focusedRef.current;
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setHighlightedQuestionId(focusQuestionId);
    const t = window.setTimeout(() => setHighlightedQuestionId(null), 2400);
    return () => window.clearTimeout(t);
  }, [quiz.id, quiz.questions, focusQuestionId]);

  // Pull recent attempts per topic so each missed question can show its own
  // trend popover, mirroring the one Task #40 added on the Dashboard side.
  const { data: topicMasteryRows = [] } = useGetDashboardTopicMastery({ limit: 5 });
  const topicInfoById = useMemo(() => {
    const m = new Map<
      number,
      { name: string; attempts: SparklineAttempt[]; trend: boolean[] }
    >();
    for (const row of topicMasteryRows) {
      const recent = row.recentAttempts ?? [];
      m.set(row.topicId, {
        name: row.name,
        attempts: recent.map((a) => ({
          correct: a.correct,
          answeredAt: a.answeredAt,
          topicName: row.name,
          quizId: a.quizId,
          questionId: a.questionId,
        })),
        trend: recent.map((a) => a.correct),
      });
    }
    return m;
  }, [topicMasteryRows]);

  return (
      <div className="flex flex-col h-full">
        <header className="h-14 border-b flex items-center px-6">
          <h1 className="text-lg font-semibold">Quiz Results</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
          <Card className="bg-primary text-primary-foreground border-none">
            <CardContent className="p-8 text-center">
              <Trophy className="h-10 w-10 mx-auto mb-2" />
              <p className="text-5xl font-bold" data-testid="text-final-score">{pct}%</p>
              <p className="opacity-90 mt-1">{correct} of {total} correct</p>
            </CardContent>
          </Card>
          {quiz.questions.map((qq, i) => {
            const isCorrect = isQuestionCorrect(qq);
            const correctSet: number[] = qq.multiSelect ? (qq.correctIndices ?? []) : [qq.correctIndex as number];
            const pickedSet: number[] = qq.multiSelect ? (qq.selectedIndices ?? []) : (qq.selectedIndex != null ? [qq.selectedIndex] : []);
            const topicInfo = qq.topicId != null ? topicInfoById.get(qq.topicId) : undefined;
            const showTrend = !isCorrect && !!topicInfo && topicInfo.attempts.length > 0;
            const isFocused = focusQuestionId != null && qq.questionId === focusQuestionId;
            const isHighlighted = highlightedQuestionId != null && qq.questionId === highlightedQuestionId;
            return (
              <Card
                key={qq.id}
                ref={isFocused ? focusedRef : undefined}
                data-testid={`results-question-${qq.questionId}`}
                data-focused={isFocused ? "true" : undefined}
                className={
                  isHighlighted
                    ? "ring-2 ring-primary ring-offset-2 ring-offset-background transition-all duration-500"
                    : "transition-all duration-500"
                }
              >
                <CardHeader>
                  <CardTitle className="text-base flex items-start gap-2">
                    {isCorrect ? <Check className="h-5 w-5 text-primary mt-0.5" /> : <X className="h-5 w-5 text-destructive mt-0.5" />}
                    <span className="flex-1">Q{i + 1}. {qq.stem}</span>
                    {qq.sourceKind === "study_group" && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 flex items-center gap-1 shrink-0"
                        data-testid={`results-question-source-${qq.questionId}`}
                      >
                        <Users className="h-3 w-3" /> Study group
                      </Badge>
                    )}
                    {qq.pendingReview && (
                      <Badge
                        variant="outline"
                        className="text-[10px] px-1.5 py-0 border-amber-300 text-amber-700 dark:text-amber-300 flex items-center gap-1 shrink-0"
                        data-testid={`results-question-pending-${qq.questionId}`}
                      >
                        <AlertTriangle className="h-3 w-3" /> Pending review
                      </Badge>
                    )}
                  </CardTitle>
                  {qq.imageUrl && (
                    <img
                      src={qq.imageUrl}
                      alt="Question figure"
                      className="mt-2 max-h-56 w-auto rounded-md border bg-muted/30 object-contain"
                    />
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {qq.multiSelect && (
                    <p className="text-xs text-muted-foreground">Select all that apply.</p>
                  )}
                  {qq.choices.map((c, ci) => {
                    const isCorrectChoice = correctSet.includes(ci);
                    const isPicked = pickedSet.includes(ci);
                    return (
                      <div
                        key={ci}
                        className={`p-2 rounded border ${isCorrectChoice ? "border-primary bg-primary/10" : isPicked ? "border-destructive bg-destructive/10" : "border-border"}`}
                      >
                        {qq.multiSelect && (
                          <span className={`inline-flex items-center justify-center w-4 h-4 mr-2 rounded border align-middle ${isCorrectChoice ? "border-primary bg-primary/20" : isPicked ? "border-destructive bg-destructive/20" : "border-border"}`}>
                            {(isCorrectChoice || isPicked) && <Check className="h-3 w-3" />}
                          </span>
                        )}
                        {String.fromCharCode(65 + ci)}. {c}
                      </div>
                    );
                  })}
                  {qq.rationale && (
                    <div className="text-muted-foreground">
                      <p className="mb-1"><strong>Rationale:</strong></p>
                      <MarkdownMessage content={qq.rationale} />
                    </div>
                  )}
                  <div className="flex items-center gap-2 flex-wrap">
                    {qq.sourceUrl && (
                      <a href={qq.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Source
                      </a>
                    )}
                    <AskAiButton context={`Help me understand this quiz question I missed:\nQ: ${qq.stem}\nMy answer: ${qq.choices[qq.selectedIndex ?? 0] ?? "n/a"}\nCorrect: ${qq.choices[qq.correctIndex ?? 0]}\nRationale: ${qq.rationale ?? "n/a"}`} size="sm" />
                    {qq.topicId != null && (
                      <Link href={`/study-group?topicId=${qq.topicId}`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs" data-testid={`button-discuss-group-${qq.id}`}>
                          <Users className="h-3 w-3 mr-1" /> Discuss with the group
                        </Button>
                      </Link>
                    )}
                  </div>
                  {showTrend && (
                    <div
                      className="flex items-center gap-2 pt-1 text-[11px] text-muted-foreground"
                      data-testid={`results-trend-${qq.id}`}
                    >
                      <span className="font-medium text-foreground">{topicInfo!.name}:</span>
                      <MasterySparkline
                        trend={topicInfo!.trend}
                        attempts={topicInfo!.attempts}
                        popoverTitle={`Recent attempts on ${topicInfo!.name}`}
                        popoverTestId={`results-trend-popover-${qq.id}`}
                        testId={`results-trend-spark-${qq.id}`}
                        caption={`last ${topicInfo!.attempts.length}`}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
          <div className="flex justify-end">
            <Link href="/quiz"><Button data-testid="button-new-quiz">New quiz</Button></Link>
          </div>
        </div>
      </div>
    );
  }

/**
 * Tour-only sample quiz screen. Mounted when the in-quiz tour is launched
 * outside of an actual quiz attempt (sentinel route /quiz/0 with the
 * __bocTourQuizRunPreview window flag set). Mirrors the real runner's
 * data-testids so every tour step lands on a real DOM element. No quiz
 * data is fetched, no answers are recorded, and nothing here persists.
 */
function TourSampleQuizView() {
  const [, navigate] = useLocation();
  const sample = {
    stem:
      "A 17-year-old soccer player rolls his ankle into inversion during a match. On the sideline he has tenderness over the lateral malleolus and is unable to bear weight for more than four steps. Which of the following is the MOST appropriate next step to determine the need for radiographs?",
    choices: [
      "Anterior drawer test",
      "Talar tilt test",
      "Apply the Ottawa Ankle Rules",
      "Squeeze (syndesmosis) test",
    ],
    correctIndex: 2,
    rationale:
      "The **Ottawa Ankle Rules** are validated clinical decision rules indicating ankle radiographs when there is bony tenderness in the malleolar zone *or* inability to bear weight for four steps both immediately and in the clinic — exactly this athlete's presentation. The anterior drawer and talar tilt assess ligamentous laxity, not fracture; the squeeze test screens for a high-ankle (syndesmotic) injury.",
  };
  const onExitSample = () => navigate("/quiz");
  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center px-6 gap-4">
        <h1 className="text-lg font-semibold">Question 1 of 10</h1>
        <Progress value={10} className="flex-1 h-2 max-w-xs" />
        <Badge variant="outline" className="text-[11px]">Sample · tour preview</Badge>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExitSample}
          data-testid="button-exit-quiz"
          title="Save progress and exit — you can resume later"
        >
          <LogOut className="h-4 w-4 mr-1" /> Exit
        </Button>
      </header>
      <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg leading-relaxed" data-testid="text-question-stem">
              {sample.stem}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {sample.choices.map((c, ci) => {
              const isCorrectChoice = ci === sample.correctIndex;
              return (
                <button
                  key={ci}
                  type="button"
                  disabled
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    isCorrectChoice ? "border-primary bg-primary/10" : "border-border opacity-60"
                  }`}
                  data-testid={`choice-${ci}`}
                >
                  <span className="font-medium mr-2">{String.fromCharCode(65 + ci)}.</span>
                  {c}
                </button>
              );
            })}
          </CardContent>
        </Card>
        <Card className="border-primary">
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Check className="h-5 w-5 text-primary" />
              <span className="font-semibold">Correct</span>
            </div>
            <MarkdownMessage content={sample.rationale} />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground italic">
                In a real attempt, an Ask-AI button appears here so you can dig deeper into this rationale.
              </span>
            </div>
          </CardContent>
        </Card>
        <div className="flex justify-between gap-2">
          <span />
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onExitSample}
              data-testid="button-finish-quiz"
            >
              Finish quiz
            </Button>
            <Button type="button" onClick={onExitSample} data-testid="button-next-question">
              Next <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
