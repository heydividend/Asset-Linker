import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetStudyPlanToday,
  useGetDashboardTopicMastery,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AskAiButton } from "@/components/AskAiButton";
import { FixItPlanCard } from "@/components/FixItPlanCard";
import { MasterySparkline } from "@/components/MasterySparkline";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
                      return (
                        <li
                          key={topic.topicId}
                          className="bg-secondary text-secondary-foreground pl-2.5 pr-1 py-1 rounded-md text-xs min-w-0 space-y-1"
                          data-testid={`weak-topic-${topic.topicId}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="flex-1 min-w-0 truncate font-medium" title={topic.name}>
                              {topic.name}
                            </span>
                            <AskAiButton
                              context={`I am weak in the topic: ${topic.name}. Can you explain the core concepts I need to know for the BOC exam?`}
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 hover:bg-background/50 rounded-md shrink-0"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-2 pr-1 text-muted-foreground">
                            <MasterySparkline
                              trend={trend}
                              testId={`weak-topic-trend-${topic.topicId}`}
                            />
                            <span className="text-xs tabular-nums">{masteryPct}% mastery</span>
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
                      return (
                        <div key={domain.domainId} className="space-y-1 min-w-0">
                          <div className="flex justify-between gap-2 text-xs min-w-0">
                            <span className="font-medium truncate flex-1 min-w-0" title={domain.name}>{domain.name}</span>
                            <span className="text-muted-foreground shrink-0">{percent}%</span>
                          </div>
                          <Progress value={percent} className="h-1.5" />
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
