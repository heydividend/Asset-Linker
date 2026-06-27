import { useMemo } from "react";
import {
  useGetAiLearningOverview,
  getGetAiLearningOverviewQueryKey,
} from "@workspace/api-client-react";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate as formatFullDate, formatDateShort } from "@/lib/formatDate";
import {
  Bot,
  Users,
  Brain,
  ClipboardList,
  Sparkles,
  Layers,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  BookOpen,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatFullDate(iso) || "—";
}

function formatPct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${Math.round(n * 1000) / 10}%`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Bot;
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <Card data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="rounded-md bg-primary/10 text-primary p-2">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider text-muted-foreground truncate">
            {label}
          </p>
          <p className="text-2xl font-semibold leading-tight">{value}</p>
          {hint && <p className="text-xs text-muted-foreground truncate">{hint}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function AILearningPage() {
  const { data, isLoading, isError } = useGetAiLearningOverview({
    query: { queryKey: getGetAiLearningOverviewQueryKey() },
  });

  const dailyChartData = useMemo(() => {
    if (!data?.accuracy?.daily) return [];
    return data.accuracy.daily.map((d) => ({
      day: formatDateShort(d.day),
      accuracy: d.accuracy != null ? Math.round(d.accuracy * 100) : 0,
      attempts: d.attempts,
    }));
  }, [data]);

  const domainChartData = useMemo(() => {
    if (!data?.accuracy?.byDomain) return [];
    return data.accuracy.byDomain.map((d) => ({
      domain: d.domainName.length > 14 ? d.domainName.slice(0, 13) + "…" : d.domainName,
      accuracy: d.accuracy != null ? Math.round(d.accuracy * 100) : 0,
      attempts: d.attempts,
    }));
  }, [data]);

  if (isLoading) {
    return (
      <div className="container max-w-6xl mx-auto p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="container max-w-6xl mx-auto p-6">
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Couldn't load AI learning data.
          </CardContent>
        </Card>
      </div>
    );
  }

  const { conversations, training, accuracy } = data;
  const overallPct = formatPct(accuracy.overall.accuracy);
  const tutorPending = training.questions.bySource.reduce(
    (acc, s) => acc + (s.pendingReview ?? 0),
    0,
  );

  return (
    <div className="container max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" /> AI Learning
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            How the AI is helping you study — and how well it's actually working.
          </p>
        </div>
      </div>

      {/* Top-line stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={Bot}
          label="Tutor chats"
          value={conversations.tutor.totalSessions}
          hint={`${conversations.tutor.totalMessages} messages`}
        />
        <StatCard
          icon={Users}
          label="Study group sessions"
          value={conversations.studyGroup.totalSessions}
          hint={`${conversations.studyGroup.totalMessages} turns`}
        />
        <StatCard
          icon={Layers}
          label="AI-generated material"
          value={training.artifacts.promoted}
          hint={`of ${training.artifacts.total} candidates promoted`}
        />
        <StatCard
          icon={TrendingUp}
          label="Quiz accuracy"
          value={overallPct}
          hint={`${accuracy.overall.correct}/${accuracy.overall.attempts} answers`}
        />
      </div>

      <Tabs defaultValue="conversations" className="w-full">
        <TabsList>
          <TabsTrigger value="conversations" data-testid="tab-conversations">
            Conversations
          </TabsTrigger>
          <TabsTrigger value="training" data-testid="tab-training">
            Training
          </TabsTrigger>
          <TabsTrigger value="accuracy" data-testid="tab-accuracy">
            Accuracy
          </TabsTrigger>
        </TabsList>

        {/* CONVERSATIONS */}
        <TabsContent value="conversations" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="h-4 w-4" /> AI Tutor chats
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {conversations.tutor.recent.length === 0 && (
                  <p className="text-sm text-muted-foreground">No tutor chats yet.</p>
                )}
                {conversations.tutor.recent.map((c) => (
                  <Link key={c.id} href="/tutor">
                    <div
                      className="flex items-center justify-between gap-3 rounded-md border p-3 hover-elevate active-elevate-2 cursor-pointer"
                      data-testid={`tutor-conv-${c.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.messageCount} message{c.messageCount === 1 ? "" : "s"} ·{" "}
                          {formatDate(c.lastMessageAt ?? c.createdAt)}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" /> Study group sessions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {conversations.studyGroup.recent.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No study group sessions yet.
                  </p>
                )}
                {conversations.studyGroup.recent.map((s) => (
                  <Link key={s.id} href={`/study-group?session=${s.id}`}>
                    <div
                      className="flex items-center justify-between gap-3 rounded-md border p-3 hover-elevate active-elevate-2 cursor-pointer"
                      data-testid={`sg-session-${s.id}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{s.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.roundCount} round{s.roundCount === 1 ? "" : "s"} ·{" "}
                          {s.messageCount} turns · {s.promotedCount}/{s.artifactCount}{" "}
                          promoted · {formatDate(s.updatedAt)}
                        </p>
                      </div>
                      <Badge
                        variant={s.status === "active" ? "default" : "secondary"}
                        className="shrink-0"
                      >
                        {s.status}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* TRAINING */}
        <TabsContent value="training" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="h-4 w-4" /> Flashcards
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{training.flashcards.total}</p>
                <p className="text-xs text-muted-foreground mb-3">total cards</p>
                <div className="space-y-1">
                  {training.flashcards.bySource.map((s) => (
                    <div
                      key={s.source}
                      className="flex justify-between text-sm"
                      data-testid={`flash-source-${s.source}`}
                    >
                      <span className="capitalize text-muted-foreground">
                        {s.source.replace("_", " ")}
                      </span>
                      <span className="font-medium">{s.count}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" /> Quiz questions
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">{training.questions.total}</p>
                <p className="text-xs text-muted-foreground mb-3">in question bank</p>
                <div className="space-y-1">
                  {training.questions.bySource.map((s) => (
                    <div
                      key={s.source}
                      className="flex justify-between text-sm"
                      data-testid={`q-source-${s.source}`}
                    >
                      <span className="capitalize text-muted-foreground">
                        {s.source.replace("_", " ")}
                      </span>
                      <span className="font-medium flex items-center gap-2">
                        {s.count}
                        {s.pendingReview > 0 && (
                          <Badge variant="outline" className="text-amber-600 border-amber-300">
                            <AlertTriangle className="h-3 w-3 mr-0.5" />
                            {s.pendingReview}
                          </Badge>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
                {tutorPending > 0 && (
                  <p className="text-xs text-amber-700 mt-3">
                    {tutorPending} pending review — open Study Group → Library to triage.
                  </p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Layers className="h-4 w-4" /> Group artifacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold">
                  {training.artifacts.promoted}
                  <span className="text-lg text-muted-foreground font-normal">
                    {" "}
                    / {training.artifacts.total}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground mb-3">
                  promoted into your study material
                </p>
                <div className="space-y-1">
                  {training.artifacts.byKind.map((k) => (
                    <div
                      key={k.kind}
                      className="flex justify-between text-sm"
                      data-testid={`artifact-kind-${k.kind}`}
                    >
                      <span className="capitalize text-muted-foreground">
                        {k.kind.replace("_", " ")}
                      </span>
                      <span className="font-medium">
                        {k.promoted}/{k.count}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" /> Recently captured
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {training.recentPromoted.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing has been promoted from a study group yet. Run a round on{" "}
                  <Link href="/study-group" className="underline">
                    Study Group
                  </Link>{" "}
                  to start filling this feed.
                </p>
              )}
              {training.recentPromoted.map((p) => (
                <Link key={p.id} href={`/study-group?session=${p.sessionId}`}>
                  <div
                    className="block rounded-md border p-3 hover-elevate active-elevate-2 cursor-pointer"
                    data-testid={`promoted-${p.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="capitalize">
                            {p.kind.replace("_", " ")}
                          </Badge>
                          {p.topicName && (
                            <span className="text-xs text-muted-foreground">
                              {p.topicName}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium line-clamp-2">{p.preview.front}</p>
                        {p.preview.back && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {p.preview.back}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          from “{p.sessionTitle}” · {formatDate(p.promotedAt)}
                        </p>
                      </div>
                      <ArrowUpRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ACCURACY */}
        <TabsContent value="accuracy" className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              icon={TrendingUp}
              label="Overall accuracy"
              value={overallPct}
              hint={`${accuracy.overall.correct}/${accuracy.overall.attempts} attempts`}
            />
            <StatCard
              icon={ClipboardList}
              label="Total attempts"
              value={accuracy.overall.attempts}
              hint="across every quiz"
            />
            <StatCard
              icon={Brain}
              label="Domains tracked"
              value={accuracy.byDomain.length}
              hint="with quiz history"
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Last 14 days</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No quiz answers in the last 14 days yet.
                </p>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="day" className="text-xs" />
                      <YAxis
                        domain={[0, 100]}
                        className="text-xs"
                        tickFormatter={(v) => `${v}%`}
                      />
                      <Tooltip
                        formatter={(v: number, name: string) =>
                          name === "accuracy" ? [`${v}%`, "Accuracy"] : [v, "Attempts"]
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="accuracy"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ r: 3 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">By BOC domain</CardTitle>
            </CardHeader>
            <CardContent>
              {domainChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No domain-tagged quiz answers yet.
                </p>
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={domainChartData} layout="vertical" margin={{ left: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        type="number"
                        domain={[0, 100]}
                        tickFormatter={(v) => `${v}%`}
                        className="text-xs"
                      />
                      <YAxis dataKey="domain" type="category" className="text-xs" width={110} />
                      <Tooltip formatter={(v: number) => [`${v}%`, "Accuracy"]} />
                      <Bar
                        dataKey="accuracy"
                        fill="hsl(var(--primary))"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
              {accuracy.byDomain.length > 0 && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {accuracy.byDomain.map((d) => (
                    <div
                      key={d.domainId}
                      className="flex justify-between rounded-md border p-2 text-sm"
                      data-testid={`domain-acc-${d.domainId}`}
                    >
                      <span className="truncate min-w-0 mr-2">{d.domainName}</span>
                      <span className="font-medium tabular-nums">
                        {formatPct(d.accuracy)} ({d.correct}/{d.attempts})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
