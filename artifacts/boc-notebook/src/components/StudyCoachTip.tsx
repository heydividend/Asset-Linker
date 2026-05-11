import { useMemo } from "react";
import { Lightbulb } from "lucide-react";
import { AskAiButton } from "./AskAiButton";

type CoachContext = "quiz-pick" | "quiz-review-wrong" | "quiz-review-right" | "mock-stuck" | "mock-pacing";

interface Tip {
  title: string;
  body: string;
}

const TIPS: Record<CoachContext, Tip[]> = {
  "quiz-pick": [
    { title: "Read every choice first", body: "Skim all four before committing — the test writers usually plant a second 'reasonable-looking' option." },
    { title: "Predict, then look", body: "Try to answer in your head before reading the choices. Then hunt for your prediction." },
    { title: "Hunt for absolutes", body: "Choices with always / never / must / completely are usually wrong. Hedged language ('may', 'if … then') wins more often." },
    { title: "Spot answer-choice families", body: "If two choices are direct opposites or close parallels, the correct answer is usually inside that family." },
  ],
  "quiz-review-wrong": [
    { title: "Name the trap", body: "Was it a fact trap (true but didn't answer the question), an extreme statement, or a missed answer-family? Label it before moving on." },
    { title: "Re-derive, don't re-read", body: "Close the rationale, then explain the correct answer out loud in one sentence. If you can't, you don't own it yet." },
  ],
  "quiz-review-right": [
    { title: "Confirm the reasoning", body: "Got it right — but did you eliminate the distractors for the right reasons? If you guessed, flag it for re-test." },
  ],
  "mock-stuck": [
    { title: "Eliminate, then commit", body: "Cross out everything you can falsify. Pick the best survivor and move on — never leave a blank." },
    { title: "Don't burn the clock", body: "If you've spent more than ~90 seconds, mark your best guess and keep going. Pacing > perfection." },
  ],
  "mock-pacing": [
    { title: "175 questions, ~4 hours", body: "Aim for ~80 seconds per item. Bank time on the easy ones for the hard ones." },
  ],
};

export function StudyCoachTip({ context, askAiContext }: { context: CoachContext; askAiContext?: string }) {
  const tip = useMemo(() => {
    const pool = TIPS[context];
    return pool[Math.floor(Math.random() * pool.length)];
  }, [context]);
  return (
    <div className="rounded-lg border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700/40 p-3 flex items-start gap-3" data-testid="study-coach-tip">
      <Lightbulb className="h-4 w-4 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 text-sm">
        <p className="font-semibold text-amber-900 dark:text-amber-200">Coach: {tip.title}</p>
        <p className="text-amber-900/90 dark:text-amber-100/90 mt-0.5">{tip.body}</p>
      </div>
      {askAiContext && (
        <AskAiButton context={askAiContext} size="sm" variant="ghost" label="Ask coach" />
      )}
    </div>
  );
}
