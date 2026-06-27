import { useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getGetStudyPlanTodayQueryKey,
  getGetDashboardSummaryQueryKey,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { CalendarRange, Check, Sparkles } from "lucide-react";

// Predefined training plans the user can pick. Each one anchors to the exam
// date currently in the dialog and back-dates the start so the study window is
// `weeks` long. The user can still fine-tune the dates afterwards.
interface TrainingPreset {
  id: string;
  label: string;
  weeks: number;
  blurb: string;
}

const TRAINING_PRESETS: TrainingPreset[] = [
  { id: "sprint", label: "4-Week Sprint", weeks: 4, blurb: "Intensive final push" },
  { id: "standard", label: "8-Week Standard", weeks: 8, blurb: "Balanced, steady prep" },
  { id: "comprehensive", label: "12-Week Comprehensive", weeks: 12, blurb: "Deep, well-paced coverage" },
  { id: "marathon", label: "16-Week Marathon", weeks: 16, blurb: "Long runway for mastery" },
];

function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toLocalIso(d);
}

function todayIso(): string {
  return toLocalIso(new Date());
}

interface Props {
  startDate: string;
  examDate: string;
  examName: string;
  trigger: ReactNode;
}

export function EditScheduleDialog({ startDate, examDate, examName, trigger }: Props) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(startDate);
  const [exam, setExam] = useState(examDate);
  const [name, setName] = useState(examName);
  const [presetId, setPresetId] = useState<string | null>(null);

  const update = useMutation({
    mutationFn: async (body: { startDate: string; examDate: string; examName: string }) => {
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
      qc.invalidateQueries({ queryKey: getGetStudyPlanTodayQueryKey() });
      qc.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
      setOpen(false);
      toast({ title: "Schedule updated" });
    },
    onError: (e) => toast({ title: "Update failed", description: String(e), variant: "destructive" }),
  });

  const applyPreset = (preset: TrainingPreset) => {
    // Anchor the plan to the exam date if one is set; otherwise count forward
    // from today so the preset always produces a valid forward-looking window.
    const anchorExam = exam || addDays(todayIso(), preset.weeks * 7);
    const computedStart = addDays(anchorExam, -preset.weeks * 7);
    setExam(anchorExam);
    setStart(computedStart);
    setName(`${preset.label} BOC Plan`);
    setPresetId(preset.id);
  };

  const onSave = () => {
    if (!start || !exam) {
      toast({ title: "Pick both dates", description: "A start date and an exam date are required.", variant: "destructive" });
      return;
    }
    if (start >= exam) {
      toast({ title: "Dates out of order", description: "The start date must be before the exam date.", variant: "destructive" });
      return;
    }
    update.mutate({ startDate: start, examDate: exam, examName: name || "BOC Study Plan" });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) {
          setStart(startDate);
          setExam(examDate);
          setName(examName);
          setPresetId(null);
        }
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Set your study schedule</DialogTitle>
          <DialogDescription>
            Pick a predefined training plan or set your own start and exam dates.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-medium">
              <Sparkles className="h-4 w-4" /> Predefined training plans
            </Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {TRAINING_PRESETS.map((p) => {
                const selected = presetId === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`text-left rounded-md border p-3 transition-colors hover:border-primary/60 hover:bg-accent ${
                      selected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                    }`}
                    data-testid={`preset-${p.id}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{p.label}</span>
                      {selected && <Check className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{p.blurb}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <CalendarRange className="h-3.5 w-3.5" /> or set custom dates
            </span>
            <div className="h-px flex-1 bg-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-sm font-medium">Start date</Label>
              <Input
                type="date"
                value={start}
                onChange={(e) => {
                  setStart(e.target.value);
                  setPresetId(null);
                }}
                data-testid="input-start-date"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Exam date</Label>
              <Input
                type="date"
                value={exam}
                onChange={(e) => {
                  setExam(e.target.value);
                  setPresetId(null);
                }}
                data-testid="input-exam-date"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-sm font-medium">Plan name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. July/August 2026 BOC Pass Plan"
              data-testid="input-plan-name"
            />
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onSave} disabled={update.isPending} data-testid="button-save-schedule">
            {update.isPending ? "Saving…" : "Save schedule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
