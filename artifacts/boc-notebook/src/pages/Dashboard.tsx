import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetStudyPlanToday,
  useGetDashboardTopicMastery,
  useStartQuiz,
  getListQuizAttemptsQueryKey,
  getGetDashboardTopicMasteryQueryKey,
  useListTopics,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AskAiButton } from "@/components/AskAiButton";
import { FixItPlanCard } from "@/components/FixItPlanCard";
import { MasterySparkline, formatRelativeAttempt } from "@/components/MasterySparkline";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  BrainCircuit,
  BookOpen,
  Clock,
  Activity,
  ArrowRight,
  CalendarDays,
  Flame,
  Sparkles,
  GraduationCap,
  Play,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

interface ScheduleDay {
  date: string;
  phase: string;
  title: string;
  totalMinutes: number;
  items: { title: string }[];
}
interface Schedule {
  startDate: string;
  examDate: string;
  examName: string;
  totalDays: number;
  daysCompleted: number;
  daysRemaining: number;
  today: string;
  days: ScheduleDay[];
}

const phaseStyles: Record<string, { label: string; className: string }> = {
  foundation: { label: "Foundation", className: "bg-chart-1/10 text-chart-1 border-chart-1/30" },
  deep_study: { label: "Deep Study", className: "bg-chart-2/10 text-chart-2 border-chart-2/30" },
  integration: { label: "Integration", className: "bg-chart-3/10 text-chart-3 border-chart-3/30" },
  final_review: { label: "Final Review", className: "bg-chart-4/10 text-chart-4 border-chart-4/30" },
  mock_exam: { label: "Mock Exam", className: "bg-primary/10 text-primary border-primary/30" },
  rest: { label: "Light / Rest", className: "bg-muted text-muted-foreground" },
  exam_day: { label: "Exam Day", className: "bg-destructive/10 text-destructive border-destructive/40" },
};

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: plan, isLoading: loadingPlan } = useGetStudyPlanToday();
  const { data: topicMasteryRows = [] } = useGetDashboardTopicMastery();
  const { data: topicsList = [] } = useListTopics();
  const { data: schedule, isLoading: loadingSchedule } = useQuery<Schedule>({
    queryKey: ["plan-schedule"],
    queryFn: () => fetch("/api/plan/schedule").then((r) => r.json()),
  });

  const upcomingDays = useMemo(() => {
    if (!schedule) return [];
    const todayIdx = schedule.days.findIndex((d) => d.date === schedule.today);
    const start = todayIdx >= 0 ? todayIdx : 0;
    return schedule.days.slice(start, start + 5);
  }, [schedule]);
  const scheduleProgress =
    schedule && schedule.totalDays > 0 ? Math.round((schedule.daysCompleted / schedule.totalDays) * 100) : 0;

  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();
  const startQuiz = useStartQuiz();

  const [openTopicId, setOpenTopicId] = useState<number | null>(null);
  const QUIZ_COUNT_OPTIONS = [5, 10, 20] as const;
  const QUIZ_COUNT_STORAGE_KEY = "boc:weakTopicQuizCountByTopicId";
  const [countByTopicId, setCountByTopicId] = useState<Record<number, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(QUIZ_COUNT_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object") return {};
      const out: Record<number, number> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const id = Number(k);
        if (
          Number.isFinite(id) &&
          typeof v === "number" &&
          (QUIZ_COUNT_OPTIONS as readonly number[]).includes(v)
        ) {
          out[id] = v;
        }
      }
      return out;
    } catch {
      return {};
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(QUIZ_COUNT_STORAGE_KEY, JSON.stringify(countByTopicId));
    } catch {
      // ignore quota / privacy errors
    }
  }, [countByTopicId]);

  const onQuizTopic = (topicId: number, topicName: string, count: number) => {
    startQuiz.mutate(
      { data: { mode: "region", count, topicIds: [topicId] } },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardTopicMasteryQueryKey() });
          qc.invalidateQueries({ queryKey: [`/api/dashboard/topic-history`] });
          navigate(`/quiz/${q.id}`);
        },
        onError: (e) => {
          toast({
            title: `Couldn't start quiz on ${topicName}`,
            description: e instanceof Error ? e.message : "Try another topic.",
            variant: "destructive",
          });
        },
      },
    );
  };

  const onQuizDomain = (domainId: number, domainName: string) => {
    startQuiz.mutate(
      { data: { mode: "domain", count: 10, domainId } },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardTopicMasteryQueryKey() });
          qc.invalidateQueries({ queryKey: [`/api/dashboard/topic-history`] });
          navigate(`/quiz/${q.id}`);
        },
        onError: (e) => {
          toast({
            title: `Couldn't start quiz on ${domainName}`,
            description: e instanceof Error ? e.message : "Try another domain.",
            variant: "destructive",
          });
        },
      },
    );
  };

  // topicId → chronological correctness of last ≤5 attempts, for the sparkline.
  const trendByTopicId = useMemo(() => {
    const m = new Map<number, boolean[]>();
    for (const row of topicMasteryRows) {
      m.set(
        row.topicId,
        (row.recentAttempts ?? []).map((a: { correct: boolean }) => a.correct),
      );
    }
    return m;
  }, [topicMasteryRows]);

  // topicId → domainId, so we can group recent attempts up to the domain level.
  const domainIdByTopicId = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of topicsList) m.set(t.id, t.domainId);
    return m;
  }, [topicsList]);

  // domainId → sorted list of topic IDs in that domain, used to deep-link
  // the Domain Mastery rows into a focused flashcard review.
  const topicIdsByDomainId = useMemo(() => {
    const m = new Map<number, number[]>();
    for (const t of topicsList) {
      const bucket = m.get(t.domainId) ?? [];
      bucket.push(t.id);
      m.set(t.domainId, bucket);
    }
    for (const ids of m.values()) ids.sort((a, b) => a - b);
    return m;
  }, [topicsList]);

  const onReviewDomain = (domainId: number, domainName: string) => {
    const ids = topicIdsByDomainId.get(domainId) ?? [];
    if (ids.length === 0) {
      toast({
        title: "No focused review available yet",
        description:
          "We don't have flashcard topics linked to this domain in the seed bank yet.",
        variant: "destructive",
      });
      return;
    }
    const params = new URLSearchParams();
    params.set("topicIds", ids.join(","));
    params.set("region", domainName);
    navigate(`/flashcards?${params.toString()}`);
  };

  // Total topics seeded per domain — denominator for "X of Y topics" caption.
  const topicCountByDomain = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of topicsList) m.set(t.domainId, (m.get(t.domainId) ?? 0) + 1);
    return m;
  }, [topicsList]);

  // domainId → chronological correctness of the most recent 5 attempts across
  // all topics in that domain, plus sample-size context so the trend caption
  // can show "5 of 23 attempts" and the tooltip can explain the coverage.
  const domainTrendStats = useMemo(() => {
    const byDomain = new Map<
      number,
      {
        merged: { correct: boolean; answeredAt: string; topicId: number }[];
        totalAttempts: number;
        topicsWithAttempts: Set<number>;
      }
    >();
    for (const row of topicMasteryRows) {
      const dId = domainIdByTopicId.get(row.topicId);
      if (dId == null) continue;
      const bucket =
        byDomain.get(dId) ?? {
          merged: [],
          totalAttempts: 0,
          topicsWithAttempts: new Set<number>(),
        };
      const attempts = (row as unknown as { attempts?: number }).attempts ?? 0;
      bucket.totalAttempts += attempts;
      if (attempts > 0) bucket.topicsWithAttempts.add(row.topicId);
      for (const a of row.recentAttempts ?? []) {
        bucket.merged.push({ ...a, topicId: row.topicId });
      }
      byDomain.set(dId, bucket);
    }
    const out = new Map<
      number,
      {
        trend: boolean[];
        shown: number;
        totalAttempts: number;
        contributingTopics: number;
        totalTopics: number;
        latest: string | null;
      }
    >();
    for (const [dId, b] of byDomain) {
      b.merged.sort((a, c) => c.answeredAt.localeCompare(a.answeredAt));
      const slice = b.merged.slice(0, 5);
      const latest = slice[0]?.answeredAt ?? null;
      const trend = slice.slice().reverse().map((a) => a.correct);
      out.set(dId, {
        trend,
        shown: slice.length,
        totalAttempts: b.totalAttempts,
        contributingTopics: b.topicsWithAttempts.size,
        totalTopics: topicCountByDomain.get(dId) ?? b.topicsWithAttempts.size,
        latest,
      });
    }
    return out;
  }, [topicMasteryRows, domainIdByTopicId, topicCountByDomain]);

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 bg-background">
        <h1 className="text-base font-semibold">Dashboard</h1>
        <ThemeToggle />
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {loadingSchedule ? (
          <Skeleton className="h-24 w-full" />
        ) : schedule ? (
          <Card className="bg-primary text-primary-foreground border-none">
            <CardContent className="p-4 flex items-center gap-4 flex-wrap">
              <CalendarDays className="h-6 w-6 opacity-90 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs opacity-90 truncate">{schedule.examName}</p>
                <p className="text-2xl font-bold leading-tight">
                  {schedule.daysRemaining}{" "}
                  <span className="text-sm font-normal opacity-90">days until exam</span>
                </p>
                <p className="text-[11px] opacity-80 mt-0.5 truncate">
                  {schedule.startDate} → {schedule.examDate} · day {schedule.daysCompleted + 1} of{" "}
                  {schedule.totalDays}
                </p>
              </div>
              <div className="w-40 space-y-1.5 shrink-0">
                <Progress value={scheduleProgress} className="h-1.5 bg-primary-foreground/20" />
                <p className="text-[11px] opacity-90 text-right">{scheduleProgress}% through</p>
              </div>
              <Link href="/schedule">
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  data-testid="button-open-schedule"
                >
                  Full schedule <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </CardContent>
            {upcomingDays.length > 0 && (
              <CardContent className="px-4 pb-4 pt-0">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                  {upcomingDays.map((d) => {
                    const isToday = d.date === schedule.today;
                    const phase = phaseStyles[d.phase] ?? phaseStyles.foundation;
                    const dt = new Date(d.date + "T00:00:00");
                    return (
                      <Link key={d.date} href="/schedule">
                        <button
                          className={`w-full text-left rounded-md p-2 bg-primary-foreground/10 hover:bg-primary-foreground/20 transition-colors ${
                            isToday ? "ring-2 ring-primary-foreground/60" : ""
                          }`}
                          data-testid={`dash-day-${d.date}`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[11px] font-semibold uppercase opacity-90">
                              {dt.toLocaleDateString(undefined, { weekday: "short" })}
                            </span>
                            {isToday && <Flame className="h-3 w-3" />}
                          </div>
                          <p className="text-xs font-medium truncate mt-0.5" title={d.title}>
                            {d.title}
                          </p>
                          <Badge
                            variant="outline"
                            className={`mt-1 text-[10px] py-0 px-1 border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground`}
                          >
                            {d.phase === "exam_day" ? (
                              <GraduationCap className="h-2.5 w-2.5 mr-1" />
                            ) : (
                              <Sparkles className="h-2.5 w-2.5 mr-1" />
                            )}
                            {phase.label}
                          </Badge>
                          <p className="text-[10px] opacity-80 mt-1 flex items-center gap-1">
                            <Clock className="h-2.5 w-2.5" /> {d.totalMinutes}m · {d.items.length} item
                            {d.items.length === 1 ? "" : "s"}
                          </p>
                        </button>
                      </Link>
                    );
                  })}
                </div>
              </CardContent>
            )}
          </Card>
        ) : null}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <Card className="bg-primary text-primary-foreground border-none">
            <CardContent className="p-4 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <p className="text-xs font-medium opacity-90 truncate">BOC Readiness</p>
                <Activity className="h-3.5 w-3.5 opacity-70 shrink-0" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-8 w-20 mt-1.5 bg-primary-foreground/20" />
              ) : (
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold">{summary?.readinessScore ?? 0}</span>
                  <span className="text-xs opacity-90">/ 100</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 min-w-0">
              <div className="flex items-center justify-between gap-2 text-muted-foreground min-w-0">
                <p className="text-xs font-medium truncate">Study Streak</p>
                <Clock className="h-3.5 w-3.5 shrink-0" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-8 w-14 mt-1.5" />
              ) : (
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold">{summary?.streakDays ?? 0}</span>
                  <span className="text-xs text-muted-foreground">days</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 min-w-0">
              <div className="flex items-center justify-between gap-2 text-muted-foreground min-w-0">
                <p className="text-xs font-medium truncate">Questions Answered</p>
                <BrainCircuit className="h-3.5 w-3.5 shrink-0" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-8 w-20 mt-1.5" />
              ) : (
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-2xl font-bold">{summary?.totalQuestionsAnswered ?? 0}</span>
                  <span className="text-xs text-muted-foreground">total</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 min-w-0">
              <div className="flex items-center justify-between gap-2 text-muted-foreground min-w-0">
                <p className="text-xs font-medium truncate">Due Flashcards</p>
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-8 w-14 mt-1.5" />
              ) : (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <span className="text-2xl font-bold">{summary?.dueFlashcards ?? 0}</span>
                  {(summary?.dueFlashcards ?? 0) > 0 && (
                    <Link href="/flashcards" className="text-xs font-medium text-primary hover:underline flex items-center shrink-0">
                      Review <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4 min-w-0">
            <FixItPlanCard />
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">Today's Study Plan</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loadingPlan ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : plan?.items?.length ? (
                  <div className="space-y-3">
                    {plan.items.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border rounded-lg hover-elevate transition-all min-w-0">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="uppercase text-[10px] tracking-wider px-1.5 py-0">{item.kind.replace('_', ' ')}</Badge>
                            <h4 className="font-medium text-sm text-foreground">{item.title}</h4>
                          </div>
                          {item.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.description}</p>}
                          <div className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Clock className="h-3 w-3" /> ~{item.estMinutes} mins
                          </div>
                        </div>
                        {item.link && (
                          <Link href={item.link}>
                            <Button size="sm" variant="secondary" className="h-7 px-2.5 text-xs shrink-0">Start</Button>
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-sm text-muted-foreground">
                    <p>No study tasks planned for today.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4 min-w-0">
            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">Weak Topics</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loadingSummary ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-7 w-full" />)}
                  </div>
                ) : summary?.weakTopics?.length ? (
                  <ul className="flex flex-col gap-1.5" data-testid="weak-topics-list">
                    {summary.weakTopics.map(topic => {
                      const trend = trendByTopicId.get(topic.topicId) ?? [];
                      const masteryPct = Math.round((topic.mastery ?? 0) * 100);
                      const isStartingThis =
                        startQuiz.isPending &&
                        startQuiz.variables?.data?.topicIds?.[0] === topic.topicId;
                      const selectedCount = countByTopicId[topic.topicId] ?? 10;
                      const isOpen = openTopicId === topic.topicId;
                      return (
                        <li
                          key={topic.topicId}
                          className="bg-secondary text-secondary-foreground rounded-md text-xs min-w-0 relative group focus-within:ring-2 focus-within:ring-ring"
                          data-testid={`weak-topic-${topic.topicId}`}
                        >
                          <Popover
                            open={isOpen}
                            onOpenChange={(o) => setOpenTopicId(o ? topic.topicId : null)}
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                disabled={startQuiz.isPending}
                                title={`Start a focused quiz on ${topic.name}`}
                                aria-label={`Start a focused quiz on ${topic.name}`}
                                data-testid={`weak-topic-quiz-${topic.topicId}`}
                                className="w-full text-left pl-2.5 pr-9 py-1 space-y-1 rounded-md hover:bg-secondary/70 hover-elevate active-elevate-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="flex-1 min-w-0 truncate font-medium" title={topic.name}>
                                    {topic.name}
                                  </span>
                                  {isStartingThis ? (
                                    <span className="text-[10px] text-muted-foreground shrink-0">
                                      Starting…
                                    </span>
                                  ) : (
                                    <Play className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0 transition-opacity" />
                                  )}
                                </div>
                                <div className="flex items-center justify-between gap-2 pr-1 text-muted-foreground">
                                  <MasterySparkline
                                    trend={trend}
                                    testId={`weak-topic-trend-${topic.topicId}`}
                                  />
                                  <span className="text-xs tabular-nums">{masteryPct}% mastery</span>
                                </div>
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="start"
                              className="w-64 p-3 space-y-3"
                              data-testid={`weak-topic-confirm-${topic.topicId}`}
                            >
                              <div className="space-y-1">
                                <p className="text-sm font-medium leading-snug">
                                  Start a {selectedCount}-question quiz on {topic.name}?
                                </p>
                                <p className="text-[11px] text-muted-foreground">
                                  Pick how many questions you want.
                                </p>
                              </div>
                              <div
                                role="radiogroup"
                                aria-label="Question count"
                                className="flex gap-1.5"
                              >
                                {QUIZ_COUNT_OPTIONS.map((c) => {
                                  const active = c === selectedCount;
                                  return (
                                    <button
                                      key={c}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      onClick={() =>
                                        setCountByTopicId((m) => ({ ...m, [topic.topicId]: c }))
                                      }
                                      data-testid={`weak-topic-count-${topic.topicId}-${c}`}
                                      className={`flex-1 px-2 py-1 rounded-md border text-xs font-medium transition-colors ${
                                        active
                                          ? "bg-primary text-primary-foreground border-primary"
                                          : "bg-background hover:bg-accent border-input"
                                      }`}
                                    >
                                      {c}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="flex justify-end gap-2 pt-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setOpenTopicId(null)}
                                  data-testid={`weak-topic-cancel-${topic.topicId}`}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setOpenTopicId(null);
                                    onQuizTopic(topic.topicId, topic.name, selectedCount);
                                  }}
                                  disabled={startQuiz.isPending}
                                  data-testid={`weak-topic-start-${topic.topicId}`}
                                >
                                  Start
                                </Button>
                              </div>
                            </PopoverContent>
                          </Popover>
                          <div className="absolute top-1 right-1">
                            <AskAiButton
                              context={`I am weak in the topic: ${topic.name}. Can you explain the core concepts I need to know for the BOC exam?`}
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 hover:bg-background/50 rounded-md shrink-0"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">No weak areas identified yet. Take more quizzes!</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2">
                <CardTitle className="text-base">Domain Mastery</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loadingSummary ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-9 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {summary?.domainMastery?.map(domain => {
                      const percent = domain.total > 0 ? Math.round((domain.correct / domain.total) * 100) : 0;
                      const stats = domainTrendStats.get(domain.domainId);
                      const trend = stats?.trend ?? [];
                      const caption =
                        stats && stats.shown > 0
                          ? stats.totalAttempts > stats.shown
                            ? `${stats.shown} of ${stats.totalAttempts} attempts`
                            : `${stats.shown} attempt${stats.shown === 1 ? "" : "s"}`
                          : undefined;
                      const tooltipParts: string[] = [];
                      if (stats && stats.shown > 0) {
                        if (stats.totalTopics > 0) {
                          tooltipParts.push(
                            `across ${stats.contributingTopics} of ${stats.totalTopics} topic${stats.totalTopics === 1 ? "" : "s"}`,
                          );
                        }
                        const rel = formatRelativeAttempt(stats.latest);
                        if (rel) tooltipParts.push(`latest ${rel}`);
                      }
                      const isStartingThis =
                        startQuiz.isPending &&
                        startQuiz.variables?.data?.mode === "domain" &&
                        startQuiz.variables?.data?.domainId === domain.domainId;
                      return (
                        <div
                          key={domain.domainId}
                          className="relative group min-w-0"
                          data-testid={`domain-mastery-${domain.domainId}`}
                        >
                          <button
                            type="button"
                            onClick={() => onQuizDomain(domain.domainId, domain.name)}
                            disabled={startQuiz.isPending}
                            title={`Start a quiz on ${domain.name}`}
                            aria-label={`Start a quiz on ${domain.name}`}
                            data-testid={`domain-mastery-quiz-${domain.domainId}`}
                            className="w-full text-left space-y-1 min-w-0 rounded-md p-1.5 -m-1.5 pr-9 hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            <div className="flex justify-between items-center gap-2 text-xs min-w-0">
                              <span className="font-medium truncate flex-1 min-w-0" title={domain.name}>{domain.name}</span>
                              {isStartingThis ? (
                                <span className="text-[10px] text-muted-foreground shrink-0">Starting…</span>
                              ) : (
                                <Play className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 shrink-0 transition-opacity" />
                              )}
                              <span className="text-muted-foreground shrink-0 tabular-nums">{percent}%</span>
                            </div>
                            <Progress value={percent} className="h-1.5" />
                            <div className="text-muted-foreground">
                              <MasterySparkline
                                trend={trend}
                                testId={`domain-trend-${domain.domainId}`}
                                caption={caption}
                                captionTestId={`domain-trend-caption-${domain.domainId}`}
                                tooltipExtra={tooltipParts.join(" · ") || undefined}
                              />
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => onReviewDomain(domain.domainId, domain.name)}
                            title={`Open a focused review for ${domain.name}`}
                            aria-label={`Open a focused review for ${domain.name}`}
                            data-testid={`domain-mastery-review-${domain.domainId}`}
                            className="absolute top-0 right-0 h-6 w-6 inline-flex items-center justify-center rounded-md text-muted-foreground hover:bg-background/50 hover-elevate active-elevate-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-colors"
                          >
                            <ArrowRight className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
