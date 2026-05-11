import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useStartMockExam, useListMockExams, useDeleteMockExam, getListMockExamsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Stethoscope, ShieldAlert, Clock, ListChecks, Award, Trash2 } from "lucide-react";

export default function MockExamLanding() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const start = useStartMockExam();
  const del = useDeleteMockExam();
  const { toast } = useToast();
  const { data: history = [] } = useListMockExams({ query: { queryKey: getListMockExamsQueryKey() } });

  const onDelete = (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (!confirm("Delete this mock exam attempt? This cannot be undone.")) return;
    del.mutate(
      { id },
      {
        onSuccess: () => {
          qc.invalidateQueries({ queryKey: getListMockExamsQueryKey() });
          toast({ title: "Attempt deleted" });
        },
        onError: (err) => toast({ title: "Delete failed", description: String(err), variant: "destructive" }),
      },
    );
  };
  const [count, setCount] = useState("175");
  const [time, setTime] = useState("14400"); // 4 hours

  const onStart = () => {
    start.mutate(
      { data: { totalQuestions: Number(count), timeLimitSec: Number(time) } },
      {
        onSuccess: (m) => {
          qc.invalidateQueries({ queryKey: getListMockExamsQueryKey() });
          navigate(`/mock-exam/${m.id}`);
        },
      },
    );
  };

  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <Stethoscope className="h-5 w-5" /> Mock Exam
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 max-w-4xl mx-auto w-full space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>How the mock exam works</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>This simulates the real BOC certification exam as closely as possible:</p>
            <ul className="space-y-2 text-muted-foreground">
              <li className="flex gap-2"><ListChecks className="h-4 w-4 mt-0.5 shrink-0" /> Questions sampled across all 5 BOC domains (D1 21%, D2 22%, D3 16%, D4 24%, D5 17%).</li>
              <li className="flex gap-2"><Clock className="h-4 w-4 mt-0.5 shrink-0" /> Strict timer. When it hits zero, the exam auto-submits — even if questions are blank.</li>
              <li className="flex gap-2"><ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" /> No back-navigation. Tab switches are recorded as visibility breaks.</li>
              <li className="flex gap-2"><Award className="h-4 w-4 mt-0.5 shrink-0" /> Pass threshold: <strong>75%</strong>. After submitting, you'll see per-domain breakdown and weak topics to focus on.</li>
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Configure</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Total questions</label>
                <Input type="number" value={count} onChange={(e) => setCount(e.target.value)} min={3} max={200} data-testid="input-total-questions" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Time limit (seconds)</label>
                <Input type="number" value={time} onChange={(e) => setTime(e.target.value)} min={300} data-testid="input-time-limit" />
                <p className="text-xs text-muted-foreground">{Math.round(Number(time) / 60)} minutes</p>
              </div>
            </div>
            <Button size="lg" onClick={onStart} disabled={start.isPending} data-testid="button-start-mock-exam">
              Start mock exam
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Past attempts</CardTitle></CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No past attempts yet.</p>
            ) : (
              <div className="space-y-2">
                {history.map((m) => {
                  const passed = (m.scorePercent ?? 0) >= 75;
                  return (
                    <div
                      key={m.id}
                      className="flex items-center gap-2 p-3 border rounded-md hover-elevate"
                      data-testid={`mock-attempt-${m.id}`}
                    >
                      <Link href={`/mock-exam/${m.id}`} className="flex-1">
                        <button className="w-full flex items-center justify-between text-left">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{m.totalQuestions}q</Badge>
                            <span className="font-medium">{new Date(m.startedAt).toLocaleString()}</span>
                            {!m.submitted && <Badge variant="secondary">In progress</Badge>}
                          </div>
                          {m.submitted && (
                            <Badge className={passed ? "bg-primary text-primary-foreground" : "bg-destructive text-destructive-foreground"}>
                              {Math.round(m.scorePercent ?? 0)}% {passed ? "Pass" : "Fail"}
                            </Badge>
                          )}
                        </button>
                      </Link>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        onClick={(e) => onDelete(e, m.id)}
                        disabled={del.isPending}
                        data-testid={`button-delete-mock-attempt-${m.id}`}
                        aria-label="Delete attempt"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
