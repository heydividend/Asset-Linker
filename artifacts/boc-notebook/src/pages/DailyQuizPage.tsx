import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Loader2, CalendarCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DailyQuizPage() {
  const [, navigate] = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const started = useRef(false);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/quizzes/daily", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Could not start today's quiz.");
      }
      const quiz = await res.json();
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

  return (
    <div className="flex flex-col h-full items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <CalendarCheck className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-lg font-semibold">Today's 50-question daily quiz</h1>
        {loading && !error && (
          <div className="space-y-2">
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Building a fresh, original BOC-style set across all 5 domains…
            </div>
            <p className="text-xs text-muted-foreground">
              This can take up to a minute the first time today. It's weighted toward your weak
              areas and counts toward per-domain mastery.
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
