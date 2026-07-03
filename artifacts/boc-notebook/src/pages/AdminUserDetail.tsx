import { useParams, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMe } from "@/hooks/use-me";
import {
  SessionStatusBadge,
  sessionDuration,
  SESSION_DURATION_HINT,
} from "@/components/SessionStatus";
import { formatDate, formatDateTime } from "@/lib/formatDate";
import {
  ArrowLeft,
  ShieldAlert,
  CheckCircle2,
  Circle,
  Clock,
  Star,
  History,
  Check,
  CalendarDays,
  BrainCircuit,
  BookOpen,
  RotateCw,
  BookMarked,
  Headphones,
  FileText,
  Gamepad2,
  GraduationCap,
  Users,
  Coffee,
  type LucideIcon,
} from "lucide-react";

type AdminUserInfo = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  banned: boolean;
  isAdmin: boolean;
  createdAt: number | string | null;
  lastSignInAt: number | string | null;
  error?: string;
};

type PlanItem = {
  key: string;
  kind: string;
  title: string;
  description?: string | null;
  estMinutes?: number;
  link?: string;
  mandatory: boolean;
  completed: boolean;
  carriedFrom?: string;
};

type PlanToday = {
  date: string;
  daysToExam?: number;
  phase?: string;
  title?: string;
  items: PlanItem[];
  mandatoryCount: number;
  completedMandatoryCount: number;
  completedCount: number;
  dayComplete: boolean;
};

type UserPlan = {
  schedule: { startDate: string; examDate: string; examName: string };
  today: PlanToday;
};

type DomainProgress = {
  domainId: number;
  code: string;
  name: string;
  correct: number;
  total: number;
  percent: number;
  scaledScore: number;
  band: string;
};

type UserProgress = {
  answered: number;
  correct: number;
  readiness: number | null;
  domainMastery: DomainProgress[];
  recentQuizzes: Array<{
    id: number;
    mode: string;
    score: number | null;
    finished: boolean;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
  recentMocks: Array<{
    id: number;
    scorePercent: number | null;
    passed: boolean | null;
    submittedAt: string | null;
  }>;
  sessions: Array<{
    id: number;
    startedAt: string;
    lastSeenAt: string;
    userAgent: string | null;
    // true = still signed in (per Clerk), false = logged out/expired,
    // null = status unknown (Clerk lookup failed).
    active: boolean | null;
  }>;
};

type ActivityEvent = {
  id: string;
  type: "quiz" | "mock" | "daily" | "tutor" | "game";
  userId: string;
  title: string;
  detail: string | null;
  at: string;
};

const ACTIVITY_LABELS: Record<ActivityEvent["type"], string> = {
  quiz: "Quiz",
  mock: "Mock exam",
  daily: "Daily quiz",
  tutor: "AI tutor",
  game: "Game",
};

// Mirrors the Dashboard's PLAN_KIND_META so the admin sees the plan exactly
// as the user does.
const PLAN_KIND_META: Record<string, { label: string; icon: LucideIcon; tone: string }> = {
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

const PHASE_LABELS: Record<string, string> = {
  foundation: "Foundation",
  deep_study: "Deep Study",
  integration: "Integration",
  final_review: "Final Review",
  mock_exam: "Mock Exam",
  rest: "Light / Rest",
  exam_day: "Exam Day",
};

function fmtWhen(v: number | string | null): string {
  if (v == null) return "—";
  return formatDateTime(typeof v === "number" ? new Date(v).toISOString() : v);
}

function accuracy(correct: number, answered: number): string {
  if (!answered) return "—";
  return `${Math.round((correct / answered) * 100)}% (${correct}/${answered})`;
}

export default function AdminUserDetail() {
  const params = useParams();
  const userId = params.id ?? "";
  const me = useMe();

  const infoQuery = useQuery<AdminUserInfo>({
    queryKey: [`/api/admin/users/${userId}`],
    queryFn: () =>
      fetch(`/api/admin/users/${userId}`, { credentials: "include" }).then((r) =>
        r.json(),
      ),
    enabled: me.data?.isAdmin === true && !!userId,
  });

  const planQuery = useQuery<UserPlan>({
    queryKey: [`/api/admin/users/${userId}/plan`],
    queryFn: () =>
      fetch(`/api/admin/users/${userId}/plan`, { credentials: "include" }).then(
        (r) => r.json(),
      ),
    enabled: me.data?.isAdmin === true && !!userId,
  });

  const progressQuery = useQuery<UserProgress>({
    queryKey: [`/api/admin/users/${userId}/progress`],
    queryFn: () =>
      fetch(`/api/admin/users/${userId}/progress`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: me.data?.isAdmin === true && !!userId,
  });

  const activityQuery = useQuery<{ activity: ActivityEvent[] }>({
    queryKey: [`/api/admin/users/${userId}/activity`],
    queryFn: () =>
      fetch(`/api/admin/users/${userId}/activity`, {
        credentials: "include",
      }).then((r) => r.json()),
    enabled: me.data?.isAdmin === true && !!userId,
  });

  if (me.isLoading) {
    return (
      <div className="p-6">
        <Skeleton className="h-8 w-64" />
      </div>
    );
  }

  if (!me.data?.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-12 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <h1 className="text-lg font-semibold">Admins only</h1>
        <p className="text-sm text-muted-foreground">
          You don't have access to this page.
        </p>
      </div>
    );
  }

  const info = infoQuery.data;
  const plan = planQuery.data;
  const today = plan?.today;
  const progress = progressQuery.data;
  const activity = activityQuery.data?.activity ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Link href="/admin">
          <Button size="icon" variant="ghost" data-testid="button-back-to-admin" title="Back to admin">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold" data-testid="text-user-email">
            {infoQuery.isLoading ? "Loading…" : info?.email ?? userId}
          </h1>
          <p className="text-sm text-muted-foreground">User details & daily schedule</p>
        </div>
        {info?.isAdmin && <Badge>Admin</Badge>}
        {info && !info.isAdmin && <Badge variant="secondary">Student</Badge>}
        {info?.banned && <Badge variant="destructive">Banned</Badge>}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Name</div>
            <div data-testid="text-user-name">
              {[info?.firstName, info?.lastName].filter(Boolean).join(" ") || "—"}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Created</div>
            <div>{fmtWhen(info?.createdAt ?? null)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last sign-in</div>
            <div>{fmtWhen(info?.lastSignInAt ?? null)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Quiz accuracy</div>
            <div>{progress ? accuracy(progress.correct, progress.answered) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Readiness</div>
            <div>{progress?.readiness ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Exam</div>
            <div>{plan?.schedule.examName ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Exam date</div>
            <div>{plan ? formatDate(plan.schedule.examDate) : "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Plan start</div>
            <div>{plan ? formatDate(plan.schedule.startDate) : "—"}</div>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-daily-schedule">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="h-4 w-4" />
              Today's Study Plan
              {today && (
                <span className="text-sm font-normal text-muted-foreground">
                  {formatDate(today.date)}
                </span>
              )}
            </CardTitle>
            {today && today.mandatoryCount > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={
                    today.dayComplete
                      ? "inline-flex items-center gap-1 font-semibold text-emerald-600"
                      : "tabular-nums text-muted-foreground"
                  }
                  data-testid="plan-progress-summary"
                >
                  {today.dayComplete && <CheckCircle2 className="h-3.5 w-3.5" />}
                  {today.completedMandatoryCount} of {today.mandatoryCount} completed
                </span>
                {today.dayComplete && (
                  <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-700">
                    <Star className="h-3 w-3" /> Day complete
                  </Badge>
                )}
              </div>
            )}
          </div>
          <CardDescription>
            Exactly what this user sees on their dashboard today
            {today?.phase && (
              <>
                {" · "}
                <span className="font-medium">
                  {PHASE_LABELS[today.phase] ?? today.phase}
                </span>
              </>
            )}
            {typeof today?.daysToExam === "number" && (
              <> · {today.daysToExam} days to exam</>
            )}
            {today?.title && <> · {today.title}</>}
          </CardDescription>
          {today && today.mandatoryCount > 0 && (
            <Progress
              value={Math.round(
                (today.completedMandatoryCount / today.mandatoryCount) * 100,
              )}
              className="h-1.5"
            />
          )}
        </CardHeader>
        <CardContent>
          {planQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : today?.items?.length ? (
            <div className="space-y-3">
              {today.items.map((item) => {
                const meta = PLAN_KIND_META[item.kind] ?? PLAN_KIND_META.review;
                const KindIcon = meta.icon;
                return (
                  <div
                    key={item.key}
                    data-testid={`plan-item-${item.key}`}
                    className={`flex min-w-0 items-start gap-3 rounded-lg border p-3 ${
                      item.completed
                        ? "border-emerald-500/30 bg-emerald-500/5"
                        : item.mandatory
                          ? "border-primary/30"
                          : ""
                    }`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 ${
                        item.completed ? "text-emerald-600" : "text-muted-foreground"
                      }`}
                    >
                      {item.completed ? (
                        <CheckCircle2 className="h-5 w-5" />
                      ) : (
                        <Circle className="h-5 w-5" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`gap-1 px-1.5 py-0 text-[10px] uppercase tracking-wider ${meta.tone}`}
                        >
                          <KindIcon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                        {item.mandatory && (
                          <Badge className="border-primary/30 bg-primary/10 px-1.5 py-0 text-[10px] uppercase tracking-wider text-primary">
                            Required
                          </Badge>
                        )}
                        {item.completed && (
                          <Badge className="gap-1 border-emerald-500/30 bg-emerald-500/15 px-1.5 py-0 text-[10px] uppercase tracking-wider text-emerald-700">
                            <Check className="h-3 w-3" /> Done
                          </Badge>
                        )}
                        {item.carriedFrom && !item.completed && (
                          <Badge
                            className="gap-1 border-amber-500/30 bg-amber-500/15 px-1.5 py-0 text-[10px] uppercase tracking-wider text-amber-700"
                            title={`Originally scheduled for ${formatDate(item.carriedFrom)}`}
                          >
                            <History className="h-3 w-3" /> Carried over
                          </Badge>
                        )}
                        <h4
                          className={`text-sm font-medium ${
                            item.completed
                              ? "text-muted-foreground line-through"
                              : "text-foreground"
                          }`}
                        >
                          {item.title}
                        </h4>
                      </div>
                      {item.description && (
                        <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">
                          {item.description}
                        </p>
                      )}
                      {typeof item.estMinutes === "number" && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> ~{item.estMinutes} mins
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No study tasks planned for today.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Domain mastery</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {progressQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            (progress?.domainMastery ?? []).map((d) => (
              <div key={d.domainId} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium">
                    {d.code} — {d.name}
                  </span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {d.total > 0 ? `${d.percent}% (${d.correct}/${d.total})` : "No data"}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${d.percent}%` }}
                  />
                </div>
                <div className="text-[11px] text-muted-foreground">{d.band}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Recent quizzes</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mode</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(progress?.recentQuizzes ?? []).map((q) => (
                  <TableRow key={q.id}>
                    <TableCell className="capitalize">{q.mode}</TableCell>
                    <TableCell>
                      {q.finished && q.score != null ? `${Math.round(q.score)}%` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(q.finishedAt ?? q.startedAt ?? "")}
                    </TableCell>
                  </TableRow>
                ))}
                {(progress?.recentQuizzes ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No quizzes yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Mock exams</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Score</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(progress?.recentMocks ?? []).map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      {m.scorePercent != null ? `${Math.round(m.scorePercent)}%` : "—"}
                    </TableCell>
                    <TableCell>
                      {m.passed == null ? "—" : m.passed ? (
                        <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-700">Pass</Badge>
                      ) : (
                        <Badge variant="destructive">Fail</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {m.submittedAt ? formatDateTime(m.submittedAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
                {(progress?.recentMocks ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                      No mock exams yet.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Activity timeline</CardTitle>
          <CardDescription>
            Quizzes, mock exams, daily quizzes, AI tutor chats, and games.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activityQuery.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : activity.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity yet.</p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              {activity.map((e) => (
                <div
                  key={e.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-2 text-xs"
                  data-testid={`user-activity-${e.id}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{ACTIVITY_LABELS[e.type]}</Badge>
                      <span className="font-medium">{e.title}</span>
                    </div>
                    {e.detail && (
                      <div className="mt-0.5 truncate text-muted-foreground">{e.detail}</div>
                    )}
                  </div>
                  <div className="whitespace-nowrap text-muted-foreground">
                    {formatDateTime(e.at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Login sessions</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead title={SESSION_DURATION_HINT}>Duration</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Last seen</TableHead>
                <TableHead>Device</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(progress?.sessions ?? []).map((s) => (
                <TableRow key={s.id} data-testid={`row-session-${s.id}`}>
                  <TableCell data-testid={`session-status-${s.id}`}>
                    <SessionStatusBadge active={s.active} />
                  </TableCell>
                  <TableCell className="text-xs tabular-nums" data-testid={`session-duration-${s.id}`}>
                    {sessionDuration(s)}
                  </TableCell>
                  <TableCell className="text-xs">{formatDateTime(s.startedAt)}</TableCell>
                  <TableCell className="text-xs">{formatDateTime(s.lastSeenAt)}</TableCell>
                  <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                    {s.userAgent ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
              {(progress?.sessions ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No login sessions yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
