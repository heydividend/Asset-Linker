import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { AskAiButton } from "@/components/AskAiButton";
import { Calendar, CalendarDays, Clock, Flame, GraduationCap, Sparkles, Pencil } from "lucide-react";
import { useState } from "react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

interface DayItem {
  kind: string;
  title: string;
  description?: string;
  estMinutes: number;
  domainId?: number | null;
  topicId?: number | null;
  notebookId?: number | null;
  link?: string;
}

function deriveLink(it: DayItem): string | null {
  if (it.link) return it.link;
  switch (it.kind) {
    case "flashcards":
      return "/flashcards";
    case "quiz": {
      const q = new URLSearchParams();
      if (it.domainId) q.set("domain", String(it.domainId));
      if (it.topicId) q.set("topic", String(it.topicId));
      const s = q.toString();
      return s ? `/quiz?${s}` : "/quiz";
    }
    case "study_guide":
    case "review":
      return it.notebookId ? `/notebooks/${it.notebookId}` : "/notebooks";
    case "audio":
      return it.notebookId ? `/notebooks/${it.notebookId}` : "/notebooks";
    case "mock_exam":
      return "/mock-exam";
    case "body_map":
      return "/body-map";
    case "matching":
      return "/games";
    case "resource":
      return "/notebooks";
    default:
      return null;
  }
}
interface DayPlan {
  date: string;
  dayIndex: number;
  daysToExam: number;
  phase: string;
  focusDomain?: string | null;
  title: string;
  totalMinutes: number;
  items: DayItem[];
}
interface Schedule {
  startDate: string;
  examDate: string;
  examName: string;
  totalDays: number;
  daysCompleted: number;
  daysRemaining: number;
  today: string;
  days: DayPlan[];
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

export default function SchedulePage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { data, isLoading } = useQuery<Schedule>({
    queryKey: ["plan-schedule"],
    queryFn: () => fetch("/api/plan/schedule").then((r) => r.json()),
  });

  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [exam, setExam] = useState("");

  const update = useMutation({
    mutationFn: async (body: { startDate: string; examDate: string }) => {
      const res = await fetch("/api/plan/schedule", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["plan-schedule"] });
      setOpen(false);
      toast({ title: "Schedule updated" });
    },
    onError: (e) => toast({ title: "Update failed", description: String(e), variant: "destructive" }),
  });

  if (isLoading || !data) {
    return <div className="p-6">Loading schedule…</div>;
  }

  const todayIdx = data.days.findIndex((d) => d.date === data.today);
  const completed = todayIdx < 0 ? data.totalDays : todayIdx;
  const progress = data.totalDays > 0 ? Math.round((completed / data.totalDays) * 100) : 0;

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center justify-between px-4 gap-2 bg-background flex-wrap">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5" /> Study Schedule
        </h1>
        <Dialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (v) {
              setStart(data.startDate);
              setExam(data.examDate);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" data-testid="button-edit-schedule">
              <Pencil className="h-4 w-4 mr-2" /> Edit dates
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit study window</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Start date</label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} data-testid="input-start-date" />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Exam date</label>
                <Input type="date" value={exam} onChange={(e) => setExam(e.target.value)} data-testid="input-exam-date" />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => update.mutate({ startDate: start, examDate: exam })} disabled={update.isPending} data-testid="button-save-schedule">
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 max-w-5xl mx-auto w-full">
        <Card className="bg-primary text-primary-foreground border-none">
          <CardContent className="p-6 flex items-center gap-6">
            <div className="flex-1">
              <p className="text-sm opacity-90">{data.examName}</p>
              <p className="text-4xl font-bold mt-1" data-testid="text-days-remaining">
                {data.daysRemaining} <span className="text-lg font-normal opacity-90">days until exam</span>
              </p>
              <p className="text-xs opacity-80 mt-1">
                {data.startDate} → {data.examDate} · day {data.daysCompleted + 1} of {data.totalDays}
              </p>
            </div>
            <div className="w-40 space-y-2">
              <Progress value={progress} className="h-2 bg-primary-foreground/20" />
              <p className="text-xs opacity-90 text-right">{progress}% through</p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {data.days.map((d) => {
            const isToday = d.date === data.today;
            const isPast = d.date < data.today;
            const phase = phaseStyles[d.phase] ?? phaseStyles.foundation;
            return (
              <Card
                key={d.date}
                className={`${isToday ? "border-l-4 border-l-primary shadow-md" : ""} ${isPast ? "opacity-60" : ""}`}
                data-testid={`day-card-${d.date}`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <CardTitle className="text-base">
                          {new Date(d.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}
                        </CardTitle>
                        <Badge variant="outline" className={phase.className}>
                          {d.phase === "exam_day" ? <GraduationCap className="h-3 w-3 mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                          {phase.label}
                        </Badge>
                        {isToday && (
                          <Badge className="bg-primary text-primary-foreground">
                            <Flame className="h-3 w-3 mr-1" /> Today
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">{d.title}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {d.totalMinutes} min
                      </span>
                      <AskAiButton
                        context={`Help me prep for my study day on ${d.date}: "${d.title}". Items: ${d.items.map((i) => i.title).join("; ")}.`}
                        size="sm"
                        variant="ghost"
                        label="Ask AI"
                      />
                    </div>
                  </div>
                </CardHeader>
                {d.items.length > 0 && (
                  <CardContent className="pt-0">
                    <ul className="space-y-2">
                      {d.items.map((it, i) => {
                        const link = deriveLink(it);
                        return (
                          <li key={i} className="flex items-start gap-2 text-sm" data-testid={`day-item-${d.date}-${i}`}>
                            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{it.title}</span>
                              {it.description && <span className="text-muted-foreground"> — {it.description}</span>}
                              <span className="text-xs text-muted-foreground ml-2">~{it.estMinutes}m</span>
                            </div>
                            {link && (
                              <Link href={link}>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-2.5 text-xs shrink-0"
                                  data-testid={`day-item-start-${d.date}-${i}`}
                                >
                                  Start
                                </Button>
                              </Link>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
