import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import { Loader2, CalendarCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

// Friendly, rotating status lines shown while the set generates. The server
// builds the whole set in a single request with no progress events, so these
// just reassure the user that work is happening during the up-to-a-minute wait.
const STAGES = [
  "Reviewing your weak areas…",
  "Spreading questions across all 5 domains…",
  "Writing fresh, original BOC-style scenarios…",
  "Double-checking answers and rationales…",
  "Almost ready…",
];

export default function DailyQuizPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const regenerate = new URLSearchParams(search).get("regenerate") === "1";
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const started = useRef(false);

  const start = async () => {
    setLoading(true);
    setError(null);
    setProgress(0);
    setStage(0);
    try {
      const res = await fetch("/api/quizzes/daily", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not start today's quiz.");
      }
      const quiz = await res.json();
      setProgress(100);
      navigate(`/quiz/${quiz.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong building today's quiz.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ease a simulated progress bar toward ~92% and rotate the status line while
  // we wait; the real completion snaps it to 100% just before navigating.
  useEffect(() => {
    if (!loading || error) return;
    const tick = setInterval(() => {
      setProgress((p) => (p < 92 ? p + Math.max(0.5, (92 - p) * 0.04) : p));
    }, 350);
    const stages = setInterval(() => {
      setStage((s) => Math.min(s + 1, STAGES.length - 1));
    }, 7000);
    return () => {
      clearInterval(tick);
      clearInterval(stages);
    };
  }, [loading, error]);

  const title = regenerate
    ? "Building a brand-new daily quiz"
    : "Today's 50-question daily quiz";

  return (
    <div className="flex flex-col h-full items-center justify-center p-6 text-center">
      <div className="max-w-md w-full space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CalendarCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {loading && !error && (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span data-testid="text-daily-quiz-stage">{STAGES[stage]}</span>
            </div>
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
                data-testid="bar-daily-quiz-progress"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {regenerate
                ? "Replacing today's set with a fresh one — this can take up to a minute."
                : "This can take up to a minute the first time today."}{" "}
              It's weighted toward your weak areas and counts toward per-domain mastery.
            </p>
          </div>
        )}
        {error && (
          <div className="space-y-3">
            <p className="text-sm text-destructive" data-testid="text-daily-quiz-error">{error}</p>
            <Button onClick={() => void start()} data-testid="button-retry-daily-quiz">
              <RefreshCw className="h-4 w-4 mr-2" /> Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
