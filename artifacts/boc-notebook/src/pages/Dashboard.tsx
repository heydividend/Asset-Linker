import { useGetDashboardSummary, useGetStudyPlanToday } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AskAiButton } from "@/components/AskAiButton";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { BrainCircuit, BookOpen, Clock, Activity, ArrowRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { data: summary, isLoading: loadingSummary } = useGetDashboardSummary();
  const { data: plan, isLoading: loadingPlan } = useGetStudyPlanToday();

  return (
    <div className="flex flex-col h-full">
      <header className="h-14 border-b flex items-center justify-between px-6 bg-background">
        <h1 className="text-lg font-semibold">Dashboard</h1>
        <ThemeToggle />
      </header>
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-primary text-primary-foreground border-none">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium opacity-90">BOC Readiness</p>
                <Activity className="h-4 w-4 opacity-70" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-10 w-24 mt-2 bg-primary-foreground/20" />
              ) : (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-4xl font-bold">{summary?.readinessScore ?? 0}</span>
                  <span className="text-sm opacity-90">/ 100</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between text-muted-foreground">
                <p className="text-sm font-medium">Study Streak</p>
                <Clock className="h-4 w-4" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-10 w-16 mt-2" />
              ) : (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{summary?.streakDays ?? 0}</span>
                  <span className="text-sm text-muted-foreground">days</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between text-muted-foreground">
                <p className="text-sm font-medium">Questions Answered</p>
                <BrainCircuit className="h-4 w-4" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-10 w-24 mt-2" />
              ) : (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{summary?.totalQuestionsAnswered ?? 0}</span>
                  <span className="text-sm text-muted-foreground">total</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between text-muted-foreground">
                <p className="text-sm font-medium">Due Flashcards</p>
                <BookOpen className="h-4 w-4" />
              </div>
              {loadingSummary ? (
                <Skeleton className="h-10 w-16 mt-2" />
              ) : (
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold">{summary?.dueFlashcards ?? 0}</span>
                  </div>
                  {(summary?.dueFlashcards ?? 0) > 0 && (
                    <Link href="/flashcards" className="text-sm font-medium text-primary hover:underline flex items-center">
                      Review <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Today's Study Plan</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPlan ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : plan?.items?.length ? (
                  <div className="space-y-4">
                    {plan.items.map((item, i) => (
                      <div key={i} className="flex items-start p-4 border rounded-lg hover-elevate transition-all">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="uppercase text-xs tracking-wider">{item.kind.replace('_', ' ')}</Badge>
                            <h4 className="font-medium text-foreground">{item.title}</h4>
                          </div>
                          {item.description && <p className="text-sm text-muted-foreground mt-1">{item.description}</p>}
                          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2">
                            <Clock className="h-3 w-3" /> ~{item.estMinutes} mins
                          </div>
                        </div>
                        {item.link && (
                          <Link href={item.link}>
                            <Button size="sm" variant="secondary">Start</Button>
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <p>No study tasks planned for today.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Weak Topics</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-8 w-full" />)}
                  </div>
                ) : summary?.weakTopics?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {summary.weakTopics.map(topic => (
                      <div key={topic.topicId} className="flex items-center gap-2 bg-secondary text-secondary-foreground px-3 py-1.5 rounded-full text-sm">
                        <span>{topic.name}</span>
                        <AskAiButton 
                          context={`I am weak in the topic: ${topic.name}. Can you explain the core concepts I need to know for the BOC exam?`} 
                          size="icon" 
                          variant="ghost" 
                          className="h-5 w-5 hover:bg-background/50 rounded-full"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No weak areas identified yet. Take more quizzes!</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Domain Mastery</CardTitle>
              </CardHeader>
              <CardContent>
                {loadingSummary ? (
                  <div className="space-y-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {summary?.domainMastery?.map(domain => {
                      const percent = domain.total > 0 ? Math.round((domain.correct / domain.total) * 100) : 0;
                      return (
                        <div key={domain.domainId} className="space-y-1.5">
                          <div className="flex justify-between text-sm">
                            <span className="font-medium truncate pr-4">{domain.name}</span>
                            <span className="text-muted-foreground">{percent}%</span>
                          </div>
                          <Progress value={percent} className="h-2" />
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
