import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  useGetDashboardSummary,
  useGetStudyPlanToday,
  useGetDashboardTopicMastery,
  useStartQuiz,
  useMarkPlanItemComplete,
  useGenerateTopicPodcast,
  getListQuizAttemptsQueryKey,
  getGetDashboardTopicMasteryQueryKey,
  getGetStudyPlanTodayQueryKey,
  getGetDashboardSummaryQueryKey,
  useListTopics,
  useGetBlueprint,
  type StudyPlanItemKind,
  type ContinueLearningItem,
} from "@workspace/api-client-react";
import { formatDate } from "@/lib/formatDate";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AskAiButton } from "@/components/AskAiButton";
import { FixItPlanCard } from "@/components/FixItPlanCard";
import { MasterySparkline, formatRelativeAttempt } from "@/components/MasterySparkline";
import { TrendWindowSelector } from "@/components/TrendWindowSelector";
import { useTrendWindow } from "@/hooks/use-trend-window";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useTour } from "@/components/TourProvider";
import { TOUR_SEEN_KEY } from "@/lib/tour";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  BrainCircuit,
  BookOpen,
  BookMarked,
  Clock,
  Activity,
  ArrowRight,
  CalendarDays,
  Flame,
  Sparkles,
  GraduationCap,
  Play,
  Check,
  CheckCircle2,
  Circle,
  Star,
  FileText,
  Headphones,
  Gamepad2,
  Image as ImageIcon,
  RotateCw,
  Coffee,
  TrendingUp,
  StickyNote,
  History,
  Users,
  AlertTriangle,
  Target,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  useListStudyGroupSessions,
  useDismissStudyGroupTimeout,
  useDismissAllStudyGroupTimeouts,
  useResumeAllStudyGroupTimeouts,
  getListStudyGroupSessionsQueryKey,
} from "@workspace/api-client-react";

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

const PLAN_KIND_META: Record<
  StudyPlanItemKind,
  { label: string; icon: LucideIcon; tone: string }
> = {
  quiz: { label: "Quiz", icon: BrainCircuit, tone: "bg-violet-500/10 text-violet-700 border-violet-500/30 dark:text-violet-300" },
  flashcards: { label: "Flashcards", icon: BookOpen, tone: "bg-sky-500/10 text-sky-700 border-sky-500/30 dark:text-sky-300" },
  review: { label: "Review", icon: RotateCw, tone: "bg-slate-500/10 text-slate-700 border-slate-500/30 dark:text-slate-300" },
  reading: { label: "Reading", icon: BookMarked, tone: "bg-rose-500/10 text-rose-700 border-rose-500/30 dark:text-rose-300" },
  audio: { label: "Podcast", icon: Headphones, tone: "bg-amber-500/10 text-amber-700 border-amber-500/30 dark:text-amber-300" },
  study_guide: { label: "Study guide", icon: FileText, tone: "bg-indigo-500/10 text-indigo-700 border-indigo-500/30 dark:text-indigo-300" },
  resource: { label: "Resource", icon: BookOpen, tone: "bg-teal-500/10 text-teal-700 border-teal-500/30 dark:text-teal-300" },
  game: { label: "Game", icon: Gamepad2, tone: "bg-fuchsia-500/10 text-fuchsia-700 border-fuchsia-500/30 dark:text-fuchsia-300" },
  mock_exam: { label: "Mock exam", icon: GraduationCap, tone: "bg-primary/10 text-primary border-primary/30" },
  study_group: { label: "Study group", icon: Users, tone: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30 dark:text-emerald-300" },
  rest: { label: "Rest", icon: Coffee, tone: "bg-muted text-muted-foreground border-border" },
};

const CONTINUE_KIND_META: Record<
  ContinueLearningItem["kind"],
  { label: string; icon: LucideIcon }
> = {
  note: { label: "Note", icon: StickyNote },
  study_guide: { label: "Study guide", icon: FileText },
  podcast: { label: "Podcast", icon: Headphones },
  game: { label: "Game", icon: Gamepad2 },
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
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

// Heaviest single-domain weight in the PA8 blueprint (D2/D4 = 25.6%), used to
// normalize exam weight onto a 0–1 scale for the study-priority score.
const MAX_DOMAIN_WEIGHT = 0.256;

interface PriorityTask {
  taskId: number;
  domainCode: string;
  taskCode: string;
  statement: string;
  questionCount: number;
  score: number;
  reasons: string[];
}

export default function Dashboard() {
  const { startTour } = useTour();
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(TOUR_SEEN_KEY)) return;
    } catch {
      return;
    }
    const t = window.setTimeout(() => {
      try {
        window.localStorage.setItem(TOUR_SEEN_KEY, "1");
      } catch {
        /* ignore */
      }
      startTour("all");
    }, 800);
    return () => window.clearTimeout(t);
  }, [startTour]);

  const [trendWindow, setTrendWindow] = useTrendWindow("dashboard");
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: plan, isLoading: loadingPlan } = useGetStudyPlanToday();
  const { data: topicMasteryRows = [] } = useGetDashboardTopicMastery({ limit: trendWindow });
  const { data: topicsList = [] } = useListTopics();
  const { data: blueprint } = useGetBlueprint();

  // Rank blueprint tasks by what to study first: blueprint relevance (exam
  // weight + PA8 importance/frequency) weighted by personal need (low
  // confidence / low mastery / unattempted).
  const studyPriorities = useMemo<PriorityTask[]>(() => {
    const rows: PriorityTask[] = [];
    for (const d of blueprint?.domains ?? []) {
      for (const t of d.tasks) {
        const impNorm = t.importance != null ? t.importance / 4 : 0.6;
        const freqNorm = t.frequency != null ? t.frequency / 5 : 0.6;
        const weightNorm = Math.min(1, d.weight / MAX_DOMAIN_WEIGHT);
        const relevance = 0.5 * weightNorm + 0.3 * impNorm + 0.2 * freqNorm;
        const confNeed = t.confidence == null ? 0.85 : (3 - t.confidence) / 2;
        const masteryNeed = t.attempts > 0 ? 1 - t.mastery : 0.7;
        const need = 0.5 * confNeed + 0.5 * masteryNeed;
        const score = relevance * (0.35 + 0.65 * need);

        const reasons: string[] = [];
        if (weightNorm >= 0.95) reasons.push("High exam weight");
        if (t.importance != null && t.importance >= 3.3) reasons.push("High importance");
        if (t.frequency != null && t.frequency >= 4.5) reasons.push("Done often");
        if (t.confidence === 1) reasons.push("You rated shaky");
        else if (t.confidence == null) reasons.push("Not yet rated");
        if (t.attempts > 0 && t.mastery < 0.6) reasons.push("Low mastery");
        else if (t.attempts === 0) reasons.push("Not attempted");

        rows.push({
          taskId: t.id,
          domainCode: d.code,
          taskCode: t.code,
          statement: t.statement,
          questionCount: t.questionCount,
          score,
          reasons: reasons.slice(0, 3),
        });
      }
    }
    // Surface drillable tasks first (the card's only action is Drill), then by score.
    rows.sort((a, b) => {
      const aDrillable = a.questionCount > 0 ? 1 : 0;
      const bDrillable = b.questionCount > 0 ? 1 : 0;
      if (aDrillable !== bDrillable) return bDrillable - aDrillable;
      return b.score - a.score;
    });
    return rows.slice(0, 5);
  }, [blueprint]);
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

  // Surface any study-group rounds that the server's stale-stream sweeper
  // flipped to timed_out while the user was elsewhere. Same data the global
  // toast notifier uses; rendered here as a persistent banner so a user who
  // landed on the dashboard fresh (no toast yet) still sees the nudge.
  const { data: sgSessions = [] } = useListStudyGroupSessions();
  const timedOutSessions = useMemo(
    () =>
      sgSessions.filter(
        (s) => (s as { timedOutAt?: string | null }).timedOutAt != null,
      ),
    [sgSessions],
  );
  const dismissTimeout = useDismissStudyGroupTimeout();
  const dismissAllTimeouts = useDismissAllStudyGroupTimeouts();
  const resumeAllTimeouts = useResumeAllStudyGroupTimeouts();
  // While a bulk resume is in-flight on the server, poll the sessions list
  // every few seconds so the amber banner drops resumed sessions as workers
  // finish. We stop early once the banner is empty (no remaining timed-out
  // sessions) and at the latest after RESUME_ALL_POLL_WINDOW_MS as a safety
  // ceiling for stragglers. Tracked via state + ref so triggering Resume All
  // again while a window is still active just resets the deadline instead of
  // stacking overlapping intervals.
  const RESUME_ALL_POLL_MS = 4000;
  const RESUME_ALL_POLL_WINDOW_MS = 5 * 60 * 1000;
  const [resumePollUntil, setResumePollUntil] = useState<number | null>(null);
  useEffect(() => {
    if (resumePollUntil == null) return;
    // Banner has cleared — nothing left to watch.
    if (timedOutSessions.length === 0) {
      setResumePollUntil(null);
      return;
    }
    // Window expired — give up polling for stragglers.
    if (Date.now() >= resumePollUntil) {
      setResumePollUntil(null);
      return;
    }
    const id = window.setInterval(() => {
      void qc.invalidateQueries({
        queryKey: getListStudyGroupSessionsQueryKey(),
      });
    }, RESUME_ALL_POLL_MS);
    return () => window.clearInterval(id);
  }, [resumePollUntil, timedOutSessions.length, qc]);
  const onResumeAllTimeouts = () => {
    if (timedOutSessions.length === 0 || resumeAllTimeouts.isPending) return;
    resumeAllTimeouts.mutate(undefined, {
      onSuccess: () => {
        // Workers are running on the server now. The amber banner is the
        // surface — no toast — and the polling effect above shrinks it as
        // each session finishes.
        void qc.invalidateQueries({
          queryKey: getListStudyGroupSessionsQueryKey(),
        });
        setResumePollUntil(Date.now() + RESUME_ALL_POLL_WINDOW_MS);
      },
    });
  };
  const onDismissAllTimeouts = () => {
    dismissAllTimeouts.mutate(undefined, {
      onSuccess: (result) => {
        qc.invalidateQueries({ queryKey: getListStudyGroupSessionsQueryKey() });
        const n = result.sessionsCleared;
        toast({
          title:
            n === 0
              ? "Nothing to dismiss"
              : n === 1
                ? "Cleared 1 stuck round"
                : `Cleared ${n} stuck rounds`,
          description: "Transcripts are still saved in Study Group.",
          action: (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate("/study-group")}
              data-testid="toast-dismiss-all-open-study-group"
            >
              Open Study Group
            </Button>
          ),
        });
      },
      onError: (e) => {
        toast({
          title: "Couldn't dismiss all",
          description: e instanceof Error ? e.message : "Try again in a moment.",
          variant: "destructive",
        });
      },
    });
  };
  const onDismissTimeout = (sessionId: number, sessionTitle: string) => {
    dismissTimeout.mutate(
      { id: sessionId },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListStudyGroupSessionsQueryKey() });
          toast({
            title: "Timeout warning dismissed",
            description: `"${sessionTitle}" — your transcript is still saved in Study Group.`,
          });
        },
        onError: (e) => {
          toast({
            title: "Couldn't dismiss",
            description: e instanceof Error ? e.message : "Try again in a moment.",
            variant: "destructive",
          });
        },
      },
    );
  };
  const startQuiz = useStartQuiz();
  const markComplete = useMarkPlanItemComplete();
  const generateTopicPodcast = useGenerateTopicPodcast();
  const [pendingPodcastTopicId, setPendingPodcastTopicId] = useState<number | null>(null);

  const onTopicPodcast = (topicId: number, topicName: string) => {
    setPendingPodcastTopicId(topicId);
    generateTopicPodcast.mutate(
      { id: topicId, data: {} },
      {
        onSuccess: (overview) => {
          qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({
            title: `Podcast queued for ${topicName}`,
            description:
              overview.status === "ready"
                ? "Ready to listen — open the notebook to play it."
                : "Generating a 5-minute episode. It'll appear in Continue learning when ready.",
            action: overview.notebookId ? (
              <Link href={`/notebooks/${overview.notebookId}`}>
                <Button size="sm" variant="secondary">Open</Button>
              </Link>
            ) : undefined,
          });
        },
        onError: (e) => {
          toast({
            title: `Couldn't generate podcast for ${topicName}`,
            description: e instanceof Error ? e.message : "Try again in a moment.",
            variant: "destructive",
          });
        },
        onSettled: () => setPendingPodcastTopicId(null),
      },
    );
  };

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

  const [openDomainPicker, setOpenDomainPicker] = useState<number | null>(null);
  const [domainCounts, setDomainCounts] = useState<Record<number, string>>({});
  const COUNT_OPTIONS = ["5", "10", "15", "20"] as const;

  const onQuizDomain = (domainId: number, domainName: string, count: number) => {
    startQuiz.mutate(
      { data: { mode: "domain", count, domainId } },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardTopicMasteryQueryKey() });
          qc.invalidateQueries({ queryKey: [`/api/dashboard/topic-history`] });
          setOpenDomainPicker(null);
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

  const onDrillPriorityTask = (taskId: number, taskCode: string, questionCount: number) => {
    if (questionCount === 0) {
      toast({
        title: "No questions yet for this task",
        description: `${taskCode} doesn't have any practice questions in your bank yet.`,
      });
      return;
    }
    startQuiz.mutate(
      { data: { mode: "topic", count: Math.min(10, questionCount), taskId } },
      {
        onSuccess: (q) => {
          qc.invalidateQueries({ queryKey: getListQuizAttemptsQueryKey() });
          qc.invalidateQueries({ queryKey: getGetDashboardTopicMasteryQueryKey() });
          navigate(`/quiz/${q.id}`);
        },
        onError: (e) => {
          toast({
            title: `Couldn't start a drill on ${taskCode}`,
            description: e instanceof Error ? e.message : "Try again.",
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

  // topicId → recent attempts (with timestamps) so the Weak Topic sparkline
  // can open the same date/result popover used elsewhere.
  const recentAttemptsByTopicId = useMemo(() => {
    const m = new Map<number, { correct: boolean; answeredAt: string; quizId: number; questionId: number }[]>();
    for (const row of topicMasteryRows) {
      m.set(row.topicId, (row.recentAttempts ?? []).map((a) => ({
        correct: a.correct,
        answeredAt: a.answeredAt,
        quizId: a.quizId,
        questionId: a.questionId,
      })));
    }
    return m;
  }, [topicMasteryRows]);

  // topicId → domainId, so we can group recent attempts up to the domain level.
  const domainIdByTopicId = useMemo(() => {
    const m = new Map<number, number>();
    for (const t of topicsList) m.set(t.id, t.domainId);
    return m;
  }, [topicsList]);

  // topicId → human-readable name, used to label each entry in the Domain
  // Mastery sparkline popover so learners can see which topic each tick was on.
  const topicNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const t of topicsList) m.set(t.id, t.name);
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
        merged: { correct: boolean; answeredAt: string; topicId: number; quizId: number; questionId: number }[];
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
        attempts: { correct: boolean; answeredAt: string; topicName: string; quizId: number; questionId: number }[];
      }
    >();
    for (const [dId, b] of byDomain) {
      b.merged.sort((a, c) => c.answeredAt.localeCompare(a.answeredAt));
      const slice = b.merged.slice(0, trendWindow);
      const latest = slice[0]?.answeredAt ?? null;
      const trend = slice.slice().reverse().map((a) => a.correct);
      const attempts = slice.map((a) => ({
        correct: a.correct,
        answeredAt: a.answeredAt,
        topicName: topicNameById.get(a.topicId) ?? "Unknown topic",
        quizId: a.quizId,
        questionId: a.questionId,
      }));
      out.set(dId, {
        trend,
        shown: slice.length,
        totalAttempts: b.totalAttempts,
        contributingTopics: b.topicsWithAttempts.size,
        totalTopics: topicCountByDomain.get(dId) ?? b.topicsWithAttempts.size,
        latest,
        attempts,
      });
    }
    return out;
  }, [topicMasteryRows, domainIdByTopicId, topicCountByDomain, topicNameById, trendWindow]);

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 bg-background">
        <h1 className="text-base font-semibold">Dashboard</h1>
        <ThemeToggle />
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {timedOutSessions.length > 0 && (
          <Card
            className="border-amber-300/70 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-500/50"
            data-testid="dashboard-study-group-timeout-alert"
          >
            <CardContent className="p-3 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                      {timedOutSessions.length === 1
                        ? "A study group round timed out"
                        : `${timedOutSessions.length} study group rounds timed out`}
                    </p>
                    <p className="text-xs text-amber-800/90 dark:text-amber-200/80 mt-0.5">
                      Your partial transcript is saved — pick up where the group left off.
                    </p>
                  </div>
                  {timedOutSessions.length > 1 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-amber-950"
                        onClick={onResumeAllTimeouts}
                        disabled={resumeAllTimeouts.isPending || dismissAllTimeouts.isPending}
                        data-testid="button-dashboard-sg-resume-all"
                        title="Re-run the latest unfinished round of every stuck session"
                      >
                        {resumeAllTimeouts.isPending
                          ? "Resuming…"
                          : (
                            <>
                              <Play className="h-3 w-3 mr-1" />
                              Resume all
                            </>
                          )}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-amber-400 text-amber-900 dark:border-amber-500/60 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                        onClick={onDismissAllTimeouts}
                        disabled={dismissAllTimeouts.isPending || resumeAllTimeouts.isPending}
                        data-testid="button-dashboard-sg-dismiss-all"
                        title="Acknowledge every stuck round — keep transcripts, hide warnings"
                      >
                        {dismissAllTimeouts.isPending ? "Dismissing…" : "Dismiss all"}
                      </Button>
                    </div>
                  )}
                </div>
                <div className="mt-2 flex flex-col gap-1.5">
                  {timedOutSessions.slice(0, 3).map((s) => {
                    const round =
                      (s as { timedOutRound?: number | null }).timedOutRound ?? 0;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center gap-2 text-xs"
                        data-testid={`dashboard-sg-timeout-${s.id}`}
                      >
                        <span className="flex-1 min-w-0 truncate text-amber-900 dark:text-amber-100">
                          <span className="font-medium">Round {round}</span>
                          <span className="text-amber-800/80 dark:text-amber-200/70">
                            {" "}
                            · {s.title}
                          </span>
                        </span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs border-amber-400 text-amber-900 dark:border-amber-500/60 dark:text-amber-100 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                          onClick={() =>
                            navigate(
                              `/study-group?session=${s.id}&round=${round}`,
                            )
                          }
                          data-testid={`button-dashboard-sg-resume-${s.id}`}
                        >
                          Resume
                          <ArrowRight className="h-3 w-3 ml-1" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-amber-900/80 dark:text-amber-100/80 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                          onClick={() => onDismissTimeout(s.id, s.title)}
                          disabled={
                            dismissTimeout.isPending &&
                            dismissTimeout.variables?.id === s.id
                          }
                          data-testid={`button-dashboard-sg-dismiss-${s.id}`}
                          title="Acknowledge — keep the transcript, hide the warning"
                        >
                          Dismiss
                        </Button>
                      </div>
                    );
                  })}
                  {timedOutSessions.length > 3 && (
                    <button
                      type="button"
                      onClick={() => navigate("/study-group")}
                      className="text-[11px] text-amber-800 dark:text-amber-200 underline self-start"
                    >
                      +{timedOutSessions.length - 3} more in Study Group
                    </button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
        {loadingSchedule ? (
          <Skeleton className="h-24 w-full" />
        ) : schedule ? (
          <Card className="bg-primary text-primary-foreground border-none" data-tour="dashboard-countdown">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <CalendarDays className="h-6 w-6 opacity-90 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs opacity-90 truncate">{schedule.examName}</p>
                  <p className="text-2xl font-bold leading-tight">
                    {schedule.daysRemaining}{" "}
                    <span className="text-sm font-normal opacity-90 whitespace-nowrap">days until exam</span>
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5 truncate">
                    {formatDate(schedule.startDate)} → {formatDate(schedule.examDate)} · day {schedule.daysCompleted + 1} of{" "}
                    {schedule.totalDays}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 sm:gap-4 w-full sm:w-auto">
                <div className="flex-1 sm:w-40 sm:flex-none space-y-1.5">
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
                    <span className="hidden sm:inline">Full schedule</span>
                    <span className="sm:hidden">Schedule</span>
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </Link>
              </div>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <Card className="bg-primary text-primary-foreground border-none" data-tour="dashboard-readiness">
            <CardContent className="p-4 min-w-0">
              <div className="flex items-center justify-between gap-2 min-w-0">
                <p className="text-xs font-medium opacity-90 truncate">BOC Readiness</p>
                <Activity className="h-3.5 w-3.5 opacity-70 shrink-0" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-8 w-20 mt-1.5 bg-primary-foreground/20" />
              ) : (
                <>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold" data-testid="readiness-score">
                      {summary?.readinessScore ?? 0}
                    </span>
                    <span className="text-xs opacity-90">/ 100</span>
                    {(summary?.readinessBonus ?? 0) > 0 && (
                      <Badge
                        variant="outline"
                        className="ml-auto text-[10px] border-primary-foreground/40 text-primary-foreground bg-primary-foreground/10 gap-1"
                        title="7-day activity bonus from study guides, podcasts, and games"
                        data-testid="readiness-bonus"
                      >
                        <TrendingUp className="h-3 w-3" /> +{summary?.readinessBonus}
                      </Badge>
                    )}
                  </div>
                  {(summary?.readinessBonus ?? 0) > 0 && (
                    <p className="text-[10px] opacity-80 mt-1 truncate">
                      Base {summary?.readinessBaseScore} + {summary?.readinessBonus} activity bonus
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card data-tour="dashboard-streak">
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

          <Card data-testid="tile-study-guides">
            <CardContent className="p-4 min-w-0">
              <div className="flex items-center justify-between gap-2 text-muted-foreground min-w-0">
                <p className="text-xs font-medium truncate">Study Guides</p>
                <FileText className="h-3.5 w-3.5 shrink-0" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-8 w-20 mt-1.5" />
              ) : (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-2xl font-bold" data-testid="study-guides-total">
                      {summary?.studyGuides?.total ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      total · {summary?.studyGuides?.withPodcast ?? 0} w/ podcast
                    </span>
                  </div>
                  <Link href="/study-guides" className="text-xs font-medium text-primary hover:underline flex items-center shrink-0">
                    Open <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </div>
              )}
              {!loadingSummary && (summary?.studyGuides?.recent7d ?? 0) > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  +{summary?.studyGuides?.recent7d} this week
                </p>
              )}
            </CardContent>
          </Card>

          <Card data-testid="tile-games">
            <CardContent className="p-4 min-w-0">
              <div className="flex items-center justify-between gap-2 text-muted-foreground min-w-0">
                <p className="text-xs font-medium truncate">Games Played</p>
                <Gamepad2 className="h-3.5 w-3.5 shrink-0" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-8 w-20 mt-1.5" />
              ) : (
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span className="text-2xl font-bold" data-testid="games-lifetime">
                      {summary?.games?.lifetime ?? 0}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      total · {summary?.games?.today ?? 0} today
                    </span>
                  </div>
                  <Link href="/games" className="text-xs font-medium text-primary hover:underline flex items-center shrink-0">
                    Play <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </div>
              )}
              {!loadingSummary && (summary?.games?.recent7d ?? 0) > 0 && (
                <p className="text-[10px] text-muted-foreground mt-1">
                  +{summary?.games?.recent7d} this week
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {studyPriorities.length > 0 && (
          <Card data-testid="dashboard-study-first" data-tour="dashboard-study-first">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" /> What to study first
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Ranked from the official BOC blueprint — exam weight plus each task's importance &amp;
                frequency, weighed against your confidence and mastery.
              </p>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-2">
              {studyPriorities.map((p, i) => (
                <div
                  key={p.taskId}
                  className="flex items-start gap-3 rounded-md border p-2.5"
                  data-testid={`study-first-${p.taskCode}`}
                >
                  <span className="text-sm font-bold text-muted-foreground w-5 shrink-0 text-center mt-0.5">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge variant="outline" className="font-mono text-[10px]">{p.taskCode}</Badge>
                      {p.reasons.map((r) => (
                        <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>
                      ))}
                    </div>
                    <p className="text-sm mt-1 line-clamp-2">{p.statement}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 shrink-0"
                    disabled={startQuiz.isPending || p.questionCount === 0}
                    onClick={() => onDrillPriorityTask(p.taskId, p.taskCode, p.questionCount)}
                    data-testid={`study-first-drill-${p.taskCode}`}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5" /> Drill
                  </Button>
                </div>
              ))}
              <div className="pt-1">
                <Link
                  href="/blueprint"
                  className="text-xs font-medium text-primary hover:underline inline-flex items-center"
                >
                  See the full blueprint <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 space-y-4 min-w-0">
            <FixItPlanCard />
            <Card data-tour="dashboard-today-plan">
              <CardHeader className="p-4 pb-2 space-y-2">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <CardTitle className="text-base">Today's Study Plan</CardTitle>
                  {plan && plan.mandatoryCount > 0 && (
                    <div className="flex items-center gap-2 text-xs">
                      <span
                        className={
                          plan.dayComplete
                            ? "text-emerald-600 font-semibold inline-flex items-center gap-1"
                            : "text-muted-foreground tabular-nums"
                        }
                        data-testid="plan-progress-summary"
                      >
                        {plan.dayComplete && <CheckCircle2 className="h-3.5 w-3.5" />}
                        {plan.completedMandatoryCount} of {plan.mandatoryCount} completed
                      </span>
                      {plan.dayComplete && (
                        <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 gap-1" data-testid="plan-day-complete-badge">
                          <Star className="h-3 w-3" /> Day complete
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
                {plan && plan.mandatoryCount > 0 && (
                  <Progress
                    value={Math.round((plan.completedMandatoryCount / plan.mandatoryCount) * 100)}
                    className="h-1.5"
                  />
                )}
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
                    {plan.items.map((item, i) => {
                      const meta = PLAN_KIND_META[item.kind] ?? PLAN_KIND_META.review;
                      const KindIcon = meta.icon;
                      return (
                      <div
                        key={item.key ?? i}
                        data-testid={`plan-item-${item.key ?? i}`}
                        data-kind={item.kind}
                        data-completed={item.completed ? "true" : "false"}
                        className={`flex items-start gap-3 p-3 border rounded-lg transition-all min-w-0 ${
                          item.completed
                            ? "bg-emerald-500/5 border-emerald-500/30"
                            : item.mandatory
                            ? "border-primary/30"
                            : "hover-elevate"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            if (!item.completed) {
                              markComplete.mutate(
                                { data: { itemKey: item.key } },
                                {
                                  onSuccess: () => {
                                    qc.invalidateQueries({ queryKey: getGetStudyPlanTodayQueryKey() });
                                    qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
                                  },
                                },
                              );
                            }
                          }}
                          disabled={item.completed || markComplete.isPending}
                          aria-label={item.completed ? "Completed" : "Mark complete"}
                          data-testid={`plan-item-toggle-${item.key ?? i}`}
                          className={`mt-0.5 shrink-0 rounded-full transition-colors ${
                            item.completed ? "text-emerald-600" : "text-muted-foreground hover:text-primary"
                          }`}
                        >
                          {item.completed ? (
                            <CheckCircle2 className="h-5 w-5" />
                          ) : (
                            <Circle className="h-5 w-5" />
                          )}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant="outline"
                              className={`uppercase text-[10px] tracking-wider px-1.5 py-0 gap-1 ${meta.tone}`}
                              data-testid={`plan-item-kind-${item.key ?? i}`}
                            >
                              <KindIcon className="h-3 w-3" />
                              {meta.label}
                            </Badge>
                            {item.mandatory && (
                              <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] tracking-wider px-1.5 py-0 uppercase" data-testid={`plan-item-mandatory-${item.key}`}>
                                Required
                              </Badge>
                            )}
                            {item.completed && (
                              <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px] tracking-wider px-1.5 py-0 uppercase gap-1" data-testid={`plan-item-done-${item.key}`}>
                                <Check className="h-3 w-3" /> Done
                              </Badge>
                            )}
                            {item.carriedFrom && !item.completed && (
                              <Badge
                                className="bg-amber-500/15 text-amber-700 border-amber-500/30 text-[10px] tracking-wider px-1.5 py-0 uppercase gap-1"
                                title={`Originally scheduled for ${item.carriedFrom}`}
                                data-testid={`plan-item-carried-${item.key}`}
                              >
                                <History className="h-3 w-3" /> Carried over
                              </Badge>
                            )}
                            <h4
                              className={`font-medium text-sm ${
                                item.completed ? "text-muted-foreground line-through" : "text-foreground"
                              }`}
                            >
                              {item.title}
                            </h4>
                          </div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground mt-1 line-clamp-3 [&_p]:m-0 [&_p+p]:mt-1">
                              <MarkdownMessage content={item.description} />
                            </div>
                          )}
                          <div className="mt-1.5 text-[11px] text-muted-foreground flex items-center gap-1.5">
                            <Clock className="h-3 w-3" /> ~{item.estMinutes} mins
                          </div>
                        </div>
                        {item.link && (
                          <Link href={item.link}>
                            <Button size="sm" variant={item.completed ? "ghost" : "secondary"} className="h-7 px-2.5 text-xs shrink-0">
                              {item.completed ? <><Check className="h-3 w-3 mr-1" />Open</> : "Start"}
                            </Button>
                          </Link>
                        )}
                      </div>
                      );
                    })}
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
            <Card data-testid="continue-learning-card">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base flex items-center gap-2">
                  <RotateCw className="h-4 w-4 text-primary" /> Continue learning
                </CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      data-testid="continue-learning-view-all"
                      disabled={!summary?.continueLearning?.length}
                    >
                      View all <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Continue learning</DialogTitle>
                      <DialogDescription>
                        Everything you've recently touched — notes, study guides, podcasts, and games.
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] -mx-1 px-1">
                      <ul className="space-y-1.5" data-testid="continue-learning-full-list">
                        {summary?.continueLearning?.map((item, idx) => {
                          const meta = CONTINUE_KIND_META[item.kind];
                          const Icon = meta.icon;
                          return (
                            <li key={`all-${item.kind}-${item.link}-${idx}`}>
                              <Link href={item.link}>
                                <button
                                  type="button"
                                  data-testid={`continue-learning-full-item-${idx}`}
                                  data-kind={item.kind}
                                  className="w-full text-left rounded-md border bg-secondary/40 hover-elevate active-elevate-2 transition-colors px-3 py-2 flex items-center gap-2 min-w-0"
                                >
                                  <Icon className="h-4 w-4 text-primary shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" title={item.title}>
                                      {item.title}
                                    </p>
                                    <p className="text-xs text-muted-foreground truncate">
                                      {meta.label}
                                      {item.subtitle ? ` · ${item.subtitle}` : ""}
                                      {" · "}
                                      {formatRelative(item.lastTouchedAt)}
                                    </p>
                                  </div>
                                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                </button>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {loadingSummary ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : (summary?.continueLearning?.length ?? 0) > 0 ? (
                  <ul className="space-y-1.5" data-testid="continue-learning-list">
                    {summary?.continueLearning?.map((item, idx) => {
                      const meta = CONTINUE_KIND_META[item.kind];
                      const Icon = meta.icon;
                      return (
                        <li key={`${item.kind}-${item.link}-${idx}`}>
                          <Link href={item.link}>
                            <button
                              type="button"
                              data-testid={`continue-learning-item-${idx}`}
                              data-kind={item.kind}
                              className="w-full text-left rounded-md border bg-secondary/40 hover-elevate active-elevate-2 transition-colors px-2.5 py-2 flex items-center gap-2 min-w-0"
                            >
                              <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium truncate" title={item.title}>
                                  {item.title}
                                </p>
                                <p className="text-[10px] text-muted-foreground truncate">
                                  {meta.label}
                                  {item.subtitle ? ` · ${item.subtitle}` : ""}
                                  {" · "}
                                  {formatRelative(item.lastTouchedAt)}
                                </p>
                              </div>
                              <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
                            </button>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nothing to pick back up yet. Add a note, generate a guide, or play a game and it'll appear here.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Weak Topics</CardTitle>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs text-muted-foreground"
                      data-testid="weak-topics-view-all"
                      disabled={!summary?.weakTopics?.length}
                    >
                      View all <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Weak Topics</DialogTitle>
                      <DialogDescription>
                        Every topic with at least 2 attempts and below 70% mastery — sorted weakest first.
                      </DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="max-h-[60vh] -mx-1 px-1">
                      <ul className="space-y-1.5" data-testid="weak-topics-full-list">
                        {summary?.weakTopics?.map((topic) => {
                          const masteryPct = Math.round((topic.mastery ?? 0) * 100);
                          return (
                            <li
                              key={`all-weak-${topic.topicId}`}
                              className="rounded-md border bg-secondary/40 px-3 py-2 flex items-center gap-3"
                              data-testid={`weak-topic-full-${topic.topicId}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" title={topic.name}>
                                  {topic.name}
                                </p>
                                <div className="mt-1">
                                  <Progress value={masteryPct} className="h-1.5" />
                                </div>
                              </div>
                              <span className="text-xs tabular-nums text-muted-foreground shrink-0 w-20 text-right">
                                {masteryPct}% mastery
                              </span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 shrink-0"
                                onClick={() => onQuizTopic(topic.topicId, topic.name, 10)}
                                disabled={startQuiz.isPending}
                                data-testid={`weak-topic-full-quiz-${topic.topicId}`}
                              >
                                <Play className="h-3 w-3 mr-1" /> Quiz
                              </Button>
                              <Link href={`/study-group?topicId=${topic.topicId}`}>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 shrink-0"
                                  data-testid={`weak-topic-full-group-${topic.topicId}`}
                                  title="Join a study group on this topic"
                                >
                                  <Users className="h-3 w-3 mr-1" /> Group
                                </Button>
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
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
                      const recentAttempts = recentAttemptsByTopicId.get(topic.topicId) ?? [];
                      const attemptsForPopover = recentAttempts.map((a) => ({
                        correct: a.correct,
                        answeredAt: a.answeredAt,
                        topicName: topic.name,
                        quizId: a.quizId,
                        questionId: a.questionId,
                      }));
                      const masteryPct = Math.round((topic.mastery ?? 0) * 100);
                      const isStartingThis =
                        startQuiz.isPending &&
                        startQuiz.variables?.data?.topicIds?.[0] === topic.topicId;
                      const selectedCount = countByTopicId[topic.topicId] ?? 10;
                      const isOpen = openTopicId === topic.topicId;
                      return (
                        <li
                          key={topic.topicId}
                          className="bg-secondary text-secondary-foreground rounded-md text-xs min-w-0 relative group focus-within:ring-2 focus-within:ring-ring px-2.5 py-1 space-y-1"
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
                                className="w-full text-left pr-7 -mx-1 px-1 py-0.5 rounded-md hover:bg-secondary/70 hover-elevate active-elevate-2 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
                          <div className="flex items-center justify-between gap-2 pr-7 text-muted-foreground">
                            <MasterySparkline
                              trend={trend}
                              testId={`weak-topic-trend-${topic.topicId}`}
                              attempts={attemptsForPopover}
                              popoverTitle={`Recent attempts · ${topic.name}`}
                              popoverTestId={`weak-topic-trend-popover-${topic.topicId}`}
                            />
                            <span className="text-xs tabular-nums">{masteryPct}% mastery</span>
                          </div>
                          <div className="absolute top-1 right-1 flex items-center gap-0.5">
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 hover:bg-background/50 rounded-md shrink-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onTopicPodcast(topic.topicId, topic.name);
                              }}
                              disabled={
                                generateTopicPodcast.isPending &&
                                pendingPodcastTopicId === topic.topicId
                              }
                              title={`Listen to a 5-min podcast on ${topic.name}`}
                              aria-label={`Generate a 5-minute podcast on ${topic.name}`}
                              data-testid={`weak-topic-podcast-${topic.topicId}`}
                            >
                              <Headphones className="h-3 w-3" />
                            </Button>
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

            <Card data-tour="dashboard-domain-mastery">
              <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between gap-2 space-y-0">
                <CardTitle className="text-base">Domain Mastery</CardTitle>
                <div className="flex items-center gap-1">
                  <TrendWindowSelector
                    value={trendWindow}
                    onChange={setTrendWindow}
                    testId="dashboard-trend-window"
                    label="Last"
                  />
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-muted-foreground"
                        data-testid="domain-mastery-view-all"
                        disabled={!summary?.domainMastery?.length}
                      >
                        View all <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Domain Mastery</DialogTitle>
                        <DialogDescription>
                          Full breakdown across all five BOC domains based on every attempt to date.
                        </DialogDescription>
                      </DialogHeader>
                      <ScrollArea className="max-h-[60vh] -mx-1 px-1">
                        <ul className="space-y-2" data-testid="domain-mastery-full-list">
                          {summary?.domainMastery?.map((domain) => {
                            const percent = domain.total > 0 ? Math.round((domain.correct / domain.total) * 100) : 0;
                            return (
                              <li
                                key={`all-domain-${domain.domainId}`}
                                className="rounded-md border bg-secondary/40 px-3 py-2 space-y-1.5"
                                data-testid={`domain-mastery-full-${domain.domainId}`}
                              >
                                <div className="flex items-center justify-between gap-2 min-w-0">
                                  <p className="text-sm font-medium truncate" title={domain.name}>
                                    <span className="text-muted-foreground tabular-nums mr-1">
                                      {domain.code}
                                    </span>
                                    {domain.name}
                                  </p>
                                  <span className="text-xs tabular-nums text-muted-foreground shrink-0">
                                    {domain.correct}/{domain.total} · {percent}%
                                  </span>
                                </div>
                                <Progress value={percent} className="h-2" />
                              </li>
                            );
                          })}
                        </ul>
                      </ScrollArea>
                    </DialogContent>
                  </Dialog>
                </div>
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
                      const cardCounts = summary?.domainFlashcardCounts?.find(
                        (c) => c.domainId === domain.domainId,
                      );
                      const cardTotal = cardCounts?.total ?? 0;
                      const cardDue = cardCounts?.due ?? 0;
                      const isStartingThis =
                        startQuiz.isPending &&
                        startQuiz.variables?.data?.mode === "domain" &&
                        startQuiz.variables?.data?.domainId === domain.domainId;
                      const selectedCount = domainCounts[domain.domainId] ?? "10";
                      const isOpen = openDomainPicker === domain.domainId;
                      return (
                        <div
                          key={domain.domainId}
                          className="relative group min-w-0 space-y-1"
                          data-testid={`domain-mastery-${domain.domainId}`}
                        >
                          <Popover
                            open={isOpen}
                            onOpenChange={(o) =>
                              setOpenDomainPicker(o ? domain.domainId : null)
                            }
                          >
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                disabled={startQuiz.isPending}
                                title={`Start a quiz on ${domain.name}`}
                                aria-label={`Choose question count and start a quiz on ${domain.name}`}
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
                                  <span
                                    className="text-muted-foreground shrink-0 tabular-nums text-[10px]"
                                    data-testid={`domain-mastery-card-count-${domain.domainId}`}
                                    title={
                                      cardTotal === 0
                                        ? "No flashcards linked to this domain yet"
                                        : `${cardTotal} flashcard${cardTotal === 1 ? "" : "s"} in this domain · ${cardDue} due now`
                                    }
                                  >
                                    {cardTotal === 0
                                      ? "no cards"
                                      : `${cardTotal} card${cardTotal === 1 ? "" : "s"} · ${cardDue} due`}
                                  </span>
                                  <span className="text-muted-foreground shrink-0 tabular-nums">{percent}%</span>
                                </div>
                                <Progress value={percent} className="h-1.5" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent
                              align="end"
                              className="w-56 p-3 space-y-3"
                              data-testid={`domain-quiz-picker-${domain.domainId}`}
                            >
                              <div className="space-y-1">
                                <p className="text-xs font-semibold">Start {domain.name} quiz</p>
                                <p className="text-[11px] text-muted-foreground">How many questions?</p>
                              </div>
                              <RadioGroup
                                value={selectedCount}
                                onValueChange={(v) =>
                                  setDomainCounts((prev) => ({ ...prev, [domain.domainId]: v }))
                                }
                                className="grid grid-cols-4 gap-1"
                              >
                                {COUNT_OPTIONS.map((c) => {
                                  const id = `domain-${domain.domainId}-count-${c}`;
                                  return (
                                    <div key={c} className="relative">
                                      <RadioGroupItem
                                        value={c}
                                        id={id}
                                        className="peer sr-only"
                                        data-testid={`domain-${domain.domainId}-count-${c}`}
                                      />
                                      <Label
                                        htmlFor={id}
                                        className="flex items-center justify-center rounded-md border text-xs h-8 cursor-pointer hover-elevate peer-data-[state=checked]:bg-primary peer-data-[state=checked]:text-primary-foreground peer-data-[state=checked]:border-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
                                      >
                                        {c}
                                      </Label>
                                    </div>
                                  );
                                })}
                              </RadioGroup>
                              <Button
                                size="sm"
                                className="w-full"
                                disabled={startQuiz.isPending}
                                onClick={() =>
                                  onQuizDomain(domain.domainId, domain.name, Number(selectedCount))
                                }
                                data-testid={`domain-quiz-start-${domain.domainId}`}
                                autoFocus
                              >
                                {isStartingThis ? "Starting…" : `Start ${selectedCount}-question quiz`}
                              </Button>
                            </PopoverContent>
                          </Popover>
                          <div className="text-muted-foreground pr-9">
                            <MasterySparkline
                              trend={trend}
                              testId={`domain-trend-${domain.domainId}`}
                              caption={caption}
                              captionTestId={`domain-trend-caption-${domain.domainId}`}
                              tooltipExtra={tooltipParts.join(" · ") || undefined}
                              attempts={stats?.attempts}
                              popoverTitle={`Recent attempts · ${domain.name}`}
                              popoverTestId={`domain-trend-popover-${domain.domainId}`}
                            />
                          </div>
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
