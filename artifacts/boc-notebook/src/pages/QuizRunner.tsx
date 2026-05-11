import { useParams, Link } from "wouter";
import { useState } from "react";
import { forgetFixItQuizId, isTodayFixItQuiz, markCompletedToday } from "@/lib/fixItPlan";
import {
  useGetQuiz,
  useAnswerQuizQuestion,
  useFinishQuiz,
  getGetQuizQueryKey,
  getGetDashboardTopicMasteryQueryKey,
  getGetDashboardSummaryQueryKey,
  getGetFixItStreakQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AskAiButton } from "@/components/AskAiButton";
import { StudyCoachTip } from "@/components/StudyCoachTip";
import { Progress } from "@/components/ui/progress";
import { Check, ChevronRight, ExternalLink, Trophy, X } from "lucide-react";

export default function QuizRunner() {
  const params = useParams();
  const id = Number(params.id);
  const qc = useQueryClient();
  const { data: quiz, isLoading } = useGetQuiz(id, { query: { enabled: !!id, queryKey: getGetQuizQueryKey(id) } });
  const answer = useAnswerQuizQuestion();
  const finish = useFinishQuiz();
  const [localIdx, setLocalIdx] = useState<number | null>(null);

  if (isLoading || !quiz) return <div className="p-6">Loading quiz…</div>;

  const total = quiz.questions.length;
  const rawIdx = localIdx ?? quiz.currentIndex;
  // Server may advance currentIndex past the last question once it's answered;
  // clamp to the last valid index so the user can still see the rationale and finish.
  const idx = Math.min(Math.max(0, rawIdx), Math.max(0, total - 1));
  const q = quiz.questions[idx];
  const allAnswered = quiz.questions.every((qq) => qq.selectedIndex != null);
  const finished = quiz.finished;

  const onPick = (choiceIdx: number) => {
    if (!q || q.selectedIndex != null) return;
    answer.mutate(
      { id: quiz.id, data: { questionId: q.questionId, selectedIndex: choiceIdx } },
      { onSuccess: () => qc.invalidateQueries({ queryKey: getGetQuizQueryKey(id) }) },
    );
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
    const correct = quiz.questions.filter((qq) => qq.selectedIndex === qq.correctIndex).length;
    const pct = Math.round((correct / total) * 100);
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
            const isCorrect = qq.selectedIndex === qq.correctIndex;
            return (
              <Card key={qq.id}>
                <CardHeader>
                  <CardTitle className="text-base flex items-start gap-2">
                    {isCorrect ? <Check className="h-5 w-5 text-primary mt-0.5" /> : <X className="h-5 w-5 text-destructive mt-0.5" />}
                    <span>Q{i + 1}. {qq.stem}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {qq.choices.map((c, ci) => (
                    <div
                      key={ci}
                      className={`p-2 rounded border ${ci === qq.correctIndex ? "border-primary bg-primary/10" : ci === qq.selectedIndex ? "border-destructive bg-destructive/10" : "border-border"}`}
                    >
                      {String.fromCharCode(65 + ci)}. {c}
                    </div>
                  ))}
                  {qq.rationale && <p className="text-muted-foreground"><strong>Rationale:</strong> {qq.rationale}</p>}
                  <div className="flex items-center gap-2">
                    {qq.sourceUrl && (
                      <a href={qq.sourceUrl} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 hover:underline">
                        <ExternalLink className="h-3 w-3" /> Source
                      </a>
                    )}
                    <AskAiButton context={`Help me understand this quiz question I missed:\nQ: ${qq.stem}\nMy answer: ${qq.choices[qq.selectedIndex ?? 0] ?? "n/a"}\nCorrect: ${qq.choices[qq.correctIndex ?? 0]}\nRationale: ${qq.rationale ?? "n/a"}`} size="sm" />
                  </div>
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

  if (!q) return <div className="p-6">No question.</div>;

  const answered = q.selectedIndex != null;
  const isCorrect = answered && q.selectedIndex === q.correctIndex;

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center px-6 gap-4">
        <h1 className="text-lg font-semibold">Question {idx + 1} of {total}</h1>
        <Progress value={((idx + 1) / total) * 100} className="flex-1 h-2 max-w-xs" />
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
            <CardTitle className="text-lg leading-relaxed" data-testid="text-question-stem">{q.stem}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {q.choices.map((c, ci) => {
              const showCorrect = answered && ci === q.correctIndex;
              const showWrong = answered && ci === q.selectedIndex && ci !== q.correctIndex;
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
                          : "border-border hover-elevate cursor-pointer"
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

        {answered && (
          <Card className={isCorrect ? "border-primary" : "border-destructive"}>
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2">
                {isCorrect ? <Check className="h-5 w-5 text-primary" /> : <X className="h-5 w-5 text-destructive" />}
                <span className="font-semibold">{isCorrect ? "Correct" : "Not quite"}</span>
              </div>
              {q.rationale && <p className="text-sm">{q.rationale}</p>}
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
