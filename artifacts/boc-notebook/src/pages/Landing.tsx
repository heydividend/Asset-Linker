import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Stethoscope, ArrowRight } from "lucide-react";

// Concept: "The Score Report." The real BOC reports a 200–800 scaled score
// (passing at 500) across five practice-analysis domains. The landing borrows
// that clinical instrument language — an editorial, asymmetric layout anchored
// by a readiness/score-report panel — so it reads as purpose-built rather than
// a generic template.

const CAPABILITIES = [
  {
    title: "Adaptive daily plan",
    body: "A schedule that bends around your exam date and keeps every streak honest.",
  },
  {
    title: "Quizzes & mock exams",
    body: "Full-length, PA8-weighted practice with side-by-side retake scoring.",
  },
  {
    title: "Mastery & readiness",
    body: "Watch domain mastery and your scaled-score trend move as you study.",
  },
  {
    title: "AI tutor",
    body: "Athletic-training answers grounded in the exam blueprint, on demand.",
  },
];

const DOMAINS = [
  { code: "D1", name: "Risk Reduction & Wellness", pct: 58 },
  { code: "D2", name: "Assessment & Diagnosis", pct: 54 },
  { code: "D3", name: "Critical Incident Management", pct: 49 },
  { code: "D4", name: "Therapeutic Intervention", pct: 71 },
  { code: "D5", name: "Healthcare Administration", pct: 52 },
];

// Illustrative scaled score for the hero panel (200–800, passing at 500).
const SCALED = 542;
const SCALED_PCT = ((SCALED - 200) / 600) * 100;

function ScoreReport() {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          Readiness
        </span>
        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Preview
        </span>
      </div>

      <div className="px-5 pt-5">
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-4xl font-semibold tracking-tight tabular-nums">
                {SCALED}
              </span>
              <span className="text-sm text-muted-foreground">/ 800</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Scaled score · passing at 500
            </p>
          </div>
          <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
            On track
          </span>
        </div>

        {/* 200–800 scaled-score track with a passing tick at 500 */}
        <div className="relative mt-4 h-2 rounded-full bg-muted">
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-primary"
            style={{ width: `${SCALED_PCT}%` }}
          />
          <div
            className="absolute -top-1 h-4 w-0.5 -translate-x-1/2 rounded-full bg-foreground/40"
            style={{ left: "50%" }}
            aria-hidden
          />
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-primary shadow"
            style={{ left: `${SCALED_PCT}%` }}
            aria-hidden
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground">
          <span>200</span>
          <span>500 pass</span>
          <span>800</span>
        </div>
      </div>

      {/* Per-domain mastery */}
      <div className="mt-5 space-y-3 border-t border-border px-5 py-5">
        {DOMAINS.map((d) => (
          <div key={d.code} className="flex items-center gap-3">
            <span className="w-6 shrink-0 font-mono text-[11px] font-medium text-muted-foreground">
              {d.code}
            </span>
            <span className="flex-1 truncate text-xs text-foreground">
              {d.name}
            </span>
            <div className="h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary/70"
                style={{ width: `${d.pct}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {d.pct}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Stethoscope className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="text-sm font-semibold tracking-tight">
              BOC Study Notebook
            </span>
          </div>
          <Link href="/sign-in">
            <Button size="sm" variant="outline" data-testid="link-sign-in">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 sm:px-8">
        <section className="grid items-center gap-12 py-16 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:py-24">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
              BOC Athletic Training · Exam Prep
            </p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
              Walk into the BOC knowing exactly where you{" "}
              <span className="text-primary">stand.</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted-foreground">
              One disciplined workspace for your study plan, quizzes, mock exams,
              domain mastery, and an AI tutor — measured against the real exam
              blueprint and kept private to your account.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link href="/sign-in">
                <Button size="lg" data-testid="cta-sign-in" className="gap-2">
                  Sign in to your account
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <p className="text-xs text-muted-foreground">
                Accounts are provisioned by
                <br className="hidden sm:block" /> your program administrator.
              </p>
            </div>
          </div>

          <div className="lg:pl-4">
            <ScoreReport />
          </div>
        </section>

        {/* Capabilities — editorial numbered list, no card chrome */}
        <section className="border-t border-border py-14 lg:py-20">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-muted-foreground">
            What's inside
          </p>
          <div className="mt-8 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            {CAPABILITIES.map((c, i) => (
              <div
                key={c.title}
                className="border-t border-border pt-5"
              >
                <div className="flex items-baseline gap-3">
                  <span className="font-mono text-xs text-primary">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3 className="text-base font-semibold tracking-tight">
                    {c.title}
                  </h3>
                </div>
                <p className="mt-2 pl-8 text-sm leading-relaxed text-muted-foreground">
                  {c.body}
                </p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-6 text-xs text-muted-foreground sm:flex-row sm:px-8">
          <span>BOC Study Notebook</span>
          <span>Study smarter, not longer.</span>
        </div>
      </footer>
    </div>
  );
}
