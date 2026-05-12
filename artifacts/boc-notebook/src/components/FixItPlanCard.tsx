import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  useGetDashboardTopicMastery,
  useListTopics,
  useGetFixItStreak,
  getGetDashboardTopicMasteryQueryKey,
  getGetFixItStreakQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/formatDate";
import { useTrendWindow } from "@/hooks/use-trend-window";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Target, X, ArrowRight, Shuffle, CheckCircle2, Flame } from "lucide-react";
import { bodyRegions } from "@/data/bodyRegions";
import {
  computeStreak,
  getCompletedDates,
  mergeServerStreak,
  todayStr,
} from "@/lib/fixItPlan";

const DISMISS_KEY = "boc.fixItPlan.dismissedDate";
const SNAPSHOT_KEY_PREFIX = "boc.fixItPlan.snapshot.";

type WeakRegion = {
  id: string;
  name: string;
  pct: number;
  attempts: number;
  topicIds: number[];
};

export function FixItPlanCard() {
  const [, navigate] = useLocation();
  const [trendWindow] = useTrendWindow("dashboard");
  const { data: masteryData, isLoading: loadingMastery } =
    useGetDashboardTopicMastery(
      { limit: trendWindow },
      { query: { queryKey: getGetDashboardTopicMasteryQueryKey({ limit: trendWindow }) } },
    );
  const { data: topicsData, isLoading: loadingTopics } = useListTopics();
  // Stabilize references so the snapshot effect below doesn't re-run on every
  // render while data is still loading. Without this, `mastery = []` was
  // creating a fresh empty array each render, cascading through useMemo →
  // liveWeakest → effect → setPlanRegions → re-render, which React aborts
  // with "Maximum update depth exceeded".
  const mastery = useMemo(() => masteryData ?? [], [masteryData]);
  const topics = useMemo(() => topicsData ?? [], [topicsData]);
  const today = todayStr();
  const qc = useQueryClient();

  const [dismissedDate, setDismissedDate] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(DISMISS_KEY);
  });

  const dismissed = dismissedDate === today;

  // Server is the source of truth for cross-device streaks. Local storage is
  // a cache so the streak still works offline / before the request resolves.
  const { data: serverStreak } = useGetFixItStreak({
    query: {
      queryKey: getGetFixItStreakQueryKey(),
      refetchOnWindowFocus: true,
      staleTime: 30_000,
    },
  });

  const [completedDates, setCompletedDates] = useState<string[]>(() =>
    getCompletedDates(),
  );

  // Merge any new server-known dates into local cache and state.
  useEffect(() => {
    if (!serverStreak) return;
    const merged = mergeServerStreak(serverStreak);
    setCompletedDates(merged);
  }, [serverStreak]);

  // Server is authoritative whenever the request has resolved. Local cache
  // only drives the UI before the first response or when offline.
  const completedToday = serverStreak
    ? serverStreak.completedToday
    : completedDates.includes(today);
  const streak = serverStreak
    ? serverStreak.streak
    : computeStreak(completedDates);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => {
      setCompletedDates(getCompletedDates());
      qc.invalidateQueries({ queryKey: getGetFixItStreakQueryKey() });
    };
    window.addEventListener("boc:fixItPlan:completed", refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("boc:fixItPlan:completed", refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [qc]);

  // Full pool of eligible weak regions (mastery < 60%, ≥ 1 attempt), deduped
  // and sorted weakest-first. The displayed plan is a slice; the rest serve
  // as swap candidates.
  const eligibleRegions = useMemo<WeakRegion[]>(() => {
    if (mastery.length === 0 || topics.length === 0) return [];
    const idByName = new Map<string, number>();
    for (const t of topics) idByName.set(t.name, t.id);
    const masteryByTopicId = new Map<
      number,
      { mastery: number; attempts: number }
    >();
    for (const m of mastery) {
      masteryByTopicId.set(m.topicId, {
        mastery: m.mastery,
        attempts: m.attempts,
      });
    }
    const computed: WeakRegion[] = [];
    for (const r of bodyRegions) {
      const ids: number[] = [];
      let totalAttempts = 0;
      let totalCorrect = 0;
      for (const name of r.topicNames) {
        const tid = idByName.get(name);
        if (tid == null) continue;
        if (!ids.includes(tid)) ids.push(tid);
        const m = masteryByTopicId.get(tid);
        if (m && m.attempts > 0) {
          totalAttempts += m.attempts;
          totalCorrect += m.mastery * m.attempts;
        }
      }
      if (totalAttempts < 1 || ids.length === 0) continue;
      const pct = (totalCorrect / totalAttempts) * 100;
      if (pct >= 60) continue;
      computed.push({
        id: r.id,
        name: r.name,
        pct,
        attempts: totalAttempts,
        topicIds: ids,
      });
    }
    // Dedupe by topicId set: when two regions share identical topic IDs (e.g.
    // mirrored left/right), prefer the one with lower mastery and skip duplicates.
    computed.sort((a, b) => a.pct - b.pct);
    const seen = new Set<string>();
    const deduped: WeakRegion[] = [];
    for (const r of computed) {
      const key = [...r.topicIds].sort((a, b) => a - b).join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    return deduped;
  }, [mastery, topics]);

  const liveWeakest = useMemo<WeakRegion[]>(
    () => eligibleRegions.slice(0, 3),
    [eligibleRegions],
  );

  // Snapshot today's plan so the user works through a stable set even if
  // mastery shifts mid-day. Naturally regenerates tomorrow. Swaps mutate
  // this snapshot in place.
  const [planRegions, setPlanRegions] = useState<WeakRegion[] | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = SNAPSHOT_KEY_PREFIX + today;
    const stored = window.localStorage.getItem(key);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as WeakRegion[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPlanRegions(parsed);
          return;
        }
      } catch {
        // fall through and re-snapshot
      }
    }
    if (liveWeakest.length > 0) {
      window.localStorage.setItem(key, JSON.stringify(liveWeakest));
      setPlanRegions(liveWeakest);
    } else {
      setPlanRegions([]);
    }
  }, [liveWeakest, today]);

  // Clean up stale snapshots from previous days.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const keep = SNAPSHOT_KEY_PREFIX + today;
    for (let i = window.localStorage.length - 1; i >= 0; i--) {
      const k = window.localStorage.key(i);
      if (k && k.startsWith(SNAPSHOT_KEY_PREFIX) && k !== keep) {
        window.localStorage.removeItem(k);
      }
    }
  }, [today]);

  const currentPlan = planRegions ?? [];

  const swapCandidate = (): WeakRegion | null => {
    const inPlan = new Set(currentPlan.map((r) => r.id));
    for (const cand of eligibleRegions) {
      if (inPlan.has(cand.id)) continue;
      // Defensive: also skip anything whose dedupe key matches an in-plan
      // region (mirrored left/right share topic IDs).
      const key = [...cand.topicIds].sort((a, b) => a - b).join(",");
      const dupOfInPlan = currentPlan.some(
        (r) => [...r.topicIds].sort((a, b) => a - b).join(",") === key,
      );
      if (dupOfInPlan) continue;
      return cand;
    }
    return null;
  };

  const onSwap = (regionId: string) => {
    const next = swapCandidate();
    if (!next) return;
    const updated = currentPlan.map((r) => (r.id === regionId ? next : r));
    setPlanRegions(updated);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        SNAPSHOT_KEY_PREFIX + today,
        JSON.stringify(updated),
      );
    }
  };

  if (dismissed) return null;
  if (loadingMastery || loadingTopics || planRegions === null) {
    return (
      <Card data-testid="fix-it-plan-loading">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" /> Today's fix-it plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }
  if (currentPlan.length === 0) return null;

  const allTopicIds = Array.from(
    new Set(currentPlan.flatMap((r) => r.topicIds)),
  );
  const regionNames = currentPlan.map((r) => r.name);

  const onDismiss = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, today);
    }
    setDismissedDate(today);
  };

  const onStart = () => {
    const params = new URLSearchParams();
    params.set("topicIds", allTopicIds.join(","));
    params.set("region", `Fix-it: ${regionNames.join(" + ")}`);
    params.set("regionLabel", "Fix-it plan");
    params.set("thenQuiz", "1");
    params.set("quizCount", "10");
    params.set("fixIt", "1");
    navigate(`/flashcards?${params.toString()}`);
  };

  const historyDays = 30;
  const historyStrip = (() => {
    const completedSet = new Set(completedDates);
    const days: { date: string; completed: boolean; isToday: boolean; label: string }[] = [];
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    for (let i = historyDays - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      days.push({
        date,
        completed: completedSet.has(date),
        isToday: i === 0,
        label: `${d.toLocaleDateString(undefined, { weekday: "short" })} ${formatDate(d)}`,
      });
    }
    const completedCount = days.filter((d) => d.completed).length;
    return (
      <div
        className="flex items-center gap-2"
        data-testid="fix-it-plan-history"
        aria-label={`Fix-it plan history: ${completedCount} of last ${historyDays} days completed`}
      >
        <div className="flex items-center gap-1">
          {days.map((d) => (
            <span
              key={d.date}
              title={`${d.label}${d.completed ? " — completed" : ""}`}
              data-testid={`fix-it-plan-history-day-${d.date}`}
              data-completed={d.completed ? "true" : "false"}
              className={
                "h-3 w-3 rounded-sm border " +
                (d.completed
                  ? "bg-primary border-primary"
                  : "bg-muted/40 border-border") +
                (d.isToday ? " ring-1 ring-primary/60 ring-offset-1 ring-offset-background" : "")
              }
            />
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {completedCount}/{historyDays}d
        </span>
      </div>
    );
  })();

  const streakBadge = streak > 0 ? (
    <Badge
      variant="secondary"
      className="text-[11px] tabular-nums flex items-center gap-1"
      data-testid="fix-it-plan-streak"
    >
      <Flame className="h-3 w-3 text-orange-500" />
      {streak}-day streak
    </Badge>
  ) : null;

  if (completedToday) {
    return (
      <Card
        className="border-primary/40 bg-gradient-to-br from-primary/10 to-transparent"
        data-testid="fix-it-plan-card"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" /> Today's fix-it plan
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                Nice work — come back tomorrow for a fresh plan.
              </p>
            </div>
            {streakBadge}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            className="flex items-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-3 text-sm font-medium text-primary"
            data-testid="fix-it-plan-done"
          >
            <CheckCircle2 className="h-5 w-5" />
            Done for today
          </div>
          {historyStrip}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="border-primary/40 bg-gradient-to-br from-primary/5 to-transparent"
      data-testid="fix-it-plan-card"
    >
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" /> Today's fix-it plan
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              A focused flashcard pass + a 10-question mixed quiz across your{" "}
              {currentPlan.length} weakest region
              {currentPlan.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {streakBadge}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 -mt-1 -mr-1 text-muted-foreground"
              onClick={onDismiss}
              data-testid="fix-it-plan-dismiss"
              title="Dismiss for today"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-2">
          {currentPlan.map((r) => {
            const canSwap = swapCandidate() !== null;
            return (
              <li
                key={r.id}
                className="flex items-center justify-between rounded-md border bg-background/60 px-3 py-2 text-sm"
                data-testid={`fix-it-plan-region-${r.id}`}
              >
                <span className="flex items-center gap-2 truncate">
                  <Target className="h-3.5 w-3.5 text-destructive shrink-0" />
                  <span className="font-medium truncate">{r.name}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <Badge
                    variant="outline"
                    className="text-[10px] tabular-nums border-destructive/60 text-destructive"
                    data-testid={`fix-it-plan-mastery-${r.id}`}
                  >
                    {Math.round(r.pct)}%
                  </Badge>
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {r.attempts} attempt{r.attempts === 1 ? "" : "s"}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    onClick={() => onSwap(r.id)}
                    disabled={!canSwap}
                    data-testid={`fix-it-plan-swap-${r.id}`}
                    title={
                      canSwap
                        ? "Swap for next-weakest region"
                        : "No other eligible regions to swap in"
                    }
                    aria-label={`Swap ${r.name} for next-weakest region`}
                  >
                    <Shuffle className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
        <Button
          className="w-full"
          size="lg"
          onClick={onStart}
          data-testid="fix-it-plan-start"
        >
          Start fix-it plan <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
        {historyStrip}
      </CardContent>
    </Card>
  );
}
