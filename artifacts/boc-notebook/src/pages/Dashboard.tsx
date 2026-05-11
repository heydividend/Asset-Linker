import { useGetDashboardSummary, useGetStudyPlanToday } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AskAiButton } from "@/components/AskAiButton";
import { FixItPlanCard } from "@/components/FixItPlanCard";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BrainCircuit, BookOpen, Clock, Activity, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: plan, isLoading: loadingPlan } = useGetStudyPlanToday();

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 bg-background">
        <h1 className="text-base font-semibold">Dashboard</h1>
        <ThemeToggle />
      </header>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
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
                  <div className="flex flex-col gap-1.5">
                    {summary.weakTopics.map(topic => (
                      <div key={topic.topicId} className="flex items-center gap-2 bg-secondary text-secondary-foreground pl-2.5 pr-1 py-1 rounded-md text-xs min-w-0">
                        <span className="flex-1 min-w-0 truncate" title={topic.name}>{topic.name}</span>
                        <AskAiButton 
                          context={`I am weak in the topic: ${topic.name}. Can you explain the core concepts I need to know for the BOC exam?`} 
                          size="icon" 
                          variant="ghost" 
                          className="h-6 w-6 hover:bg-background/50 rounded-md shrink-0"
                        />
                      </div>
                    ))}
                  </div>
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
