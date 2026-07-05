import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ListChecks,
  CircleDot,
  ListPlus,
  GripVertical,
  MousePointerClick,
  Layers,
  Target,
  Scale,
  ShieldCheck,
  SplitSquareHorizontal,
} from "lucide-react";
import seizureExample from "@assets/Screenshot_2026-07-05_at_10.01.14_AM_1783273900271.png";

type ScoreKind = "single" | "partial" | "testlet";

type QType = {
  id: string;
  n: number;
  name: string;
  icon: typeof CircleDot;
  score: ScoreKind;
  what: string;
  tip: string;
};

const QUESTION_TYPES: QType[] = [
  {
    id: "mc",
    n: 1,
    name: "Multiple choice",
    icon: CircleDot,
    score: "single",
    what: "A single question with 4 or 5 options where exactly one answer is correct. The classic exam item — pick the one best answer.",
    tip: "There is no partial credit, so eliminate obviously wrong options first, then choose the best remaining answer.",
  },
  {
    id: "multi",
    n: 2,
    name: "Multi-select multiple choice",
    icon: ListPlus,
    score: "partial",
    what: "\u201cSelect all that apply.\u201d Several options may be correct and you must choose every correct one (and none of the wrong ones) for full marks.",
    tip: "Treat each option as its own true/false decision. Missing a correct answer or adding a wrong one lowers your partial score \u2014 but you can never go below zero.",
  },
  {
    id: "dnd",
    n: 3,
    name: "Drag and drop",
    icon: GripVertical,
    score: "partial",
    what: "Arrange, order, or match items into the correct positions or categories by dragging them into place.",
    tip: "Each correct placement earns credit on its own, so place the ones you are sure of first \u2014 partial credit still applies.",
  },
  {
    id: "hotspot",
    n: 4,
    name: "Hot spots",
    icon: MousePointerClick,
    score: "single",
    what: "Click the correct region on an image or diagram \u2014 for example an anatomical landmark or a spot on an X-ray.",
    tip: "It is all-or-nothing: your click either lands in the correct zone or it does not, so be precise.",
  },
  {
    id: "testlet",
    n: 5,
    name: "Focused testlets / scenario-based",
    icon: Layers,
    score: "testlet",
    what: "A clinical scenario followed by several linked questions. The questions build on one patient case but each item is graded on its own.",
    tip: "Because each item is scored independently, a wrong answer on one part does not carry over \u2014 keep going even if you are unsure about an earlier item.",
  },
];

const SCORE_META: Record<
  ScoreKind,
  { label: string; className: string; short: string }
> = {
  single: {
    label: "0 or 1 (correct or incorrect)",
    short: "All or nothing",
    className:
      "border-slate-400/40 text-slate-700 dark:text-slate-300",
  },
  partial: {
    label: "0 to 1 \u00b7 partial credit \u00b7 never negative",
    short: "Partial credit",
    className:
      "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  },
  testlet: {
    label: "Each item scored independently",
    short: "Per-item scoring",
    className: "border-sky-500/40 text-sky-700 dark:text-sky-300",
  },
};

const SCORING_RULES: {
  icon: typeof Target;
  title: string;
  detail: string;
  applies: string;
}[] = [
  {
    icon: Target,
    title: "Single-response items are 0 or 1",
    detail:
      "Multiple choice and hot spot questions are scored as either correct (1) or incorrect (0). There is no middle ground.",
    applies: "Multiple choice \u00b7 Hot spots",
  },
  {
    icon: Scale,
    title: "Multi-response items give partial credit",
    detail:
      "Multi-select and drag-and-drop questions are scored on a scale from 0 to 1. Getting some parts right earns a fraction of the point.",
    applies: "Multi-select \u00b7 Drag and drop",
  },
  {
    icon: ShieldCheck,
    title: "You can never lose points",
    detail:
      "Partial-credit items can\u2019t drop below zero. A wrong selection can reduce that item\u2019s score to 0 at worst \u2014 it never subtracts from the rest of your exam.",
    applies: "Multi-select \u00b7 Drag and drop",
  },
  {
    icon: SplitSquareHorizontal,
    title: "Testlet items stand alone",
    detail:
      "In a focused testlet, every question is graded independently. Missing one item in the scenario does not cost you credit on the others.",
    applies: "Focused testlets",
  },
];

export default function QuestionTypesPage() {
  return (
    <div className="flex flex-col h-full">
      <header className="h-12 border-b flex items-center px-4 shrink-0">
        <h1 className="text-base font-semibold flex items-center gap-2">
          <ListChecks className="h-4 w-4" /> Question Types &amp; Scoring
        </h1>
      </header>
      <div className="flex-1 overflow-y-auto p-4 space-y-6 max-w-4xl mx-auto w-full">
        <p className="text-sm text-muted-foreground leading-relaxed">
          The BOC exam uses five question formats, and they are not all scored
          the same way. Knowing how each one is graded helps you spend your time
          where the points are. Here is what to expect and how each type earns
          credit.
        </p>

        {/* Question types */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            The five question types
          </h2>
          {QUESTION_TYPES.map((q) => {
            const Icon = q.icon;
            const meta = SCORE_META[q.score];
            return (
              <Card key={q.id} data-testid={`qtype-${q.id}`}>
                <CardHeader className="p-4 pb-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Badge variant="secondary" className="font-mono">
                        {q.n}
                      </Badge>
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      {q.name}
                    </CardTitle>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${meta.className}`}
                    >
                      {meta.short}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-2">
                  <p className="text-sm leading-relaxed">{q.what}</p>
                  <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-border pl-3">
                    <span className="font-medium text-foreground">Strategy:</span>{" "}
                    {q.tip}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </section>

        {/* Scoring rules */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            How scoring works
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {SCORING_RULES.map((r) => {
              const Icon = r.icon;
              return (
                <Card key={r.title} data-testid={`scoring-${r.title}`}>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4 text-primary shrink-0" />
                      <h3 className="text-sm font-semibold">{r.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {r.detail}
                    </p>
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {r.applies}
                    </Badge>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Scoring cheat-sheet */}
          <Card data-testid="scoring-cheatsheet">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm">Scoring at a glance</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="divide-y text-sm">
                {QUESTION_TYPES.map((q) => {
                  const meta = SCORE_META[q.score];
                  return (
                    <div
                      key={q.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="flex items-center gap-2">
                        <q.icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        {q.name}
                      </span>
                      <span className="text-xs text-muted-foreground text-right">
                        {meta.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Worked example */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Example: a combination multiple-choice item
          </h2>
          <Card data-testid="worked-example">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground leading-relaxed">
                This is a standard single-answer multiple-choice question in the
                &ldquo;combination&rdquo; format: the stem lists numbered steps
                (I&ndash;VI) and each lettered option bundles several of them. You
                still pick just one option &mdash; the one whose combination of
                steps is entirely correct &mdash; so it is scored all-or-nothing
                like any multiple-choice item.
              </p>
              <img
                src={seizureExample}
                alt="Sample BOC combination multiple-choice question about managing an athlete having a seizure, with answer B (I, II, III, IV) marked correct."
                className="w-full rounded-md border"
              />
              <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-emerald-500/40 pl-3">
                <span className="font-medium text-foreground">
                  Why B is correct:
                </span>{" "}
                keeping spectators away, protecting the head and body, turning
                the athlete on their side, and seeking further medical support
                for status epilepticus or a first seizure are all appropriate.
                Forcing the mouth open (V) can injure the athlete, so any option
                that includes it is wrong.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </div>
  );
}
