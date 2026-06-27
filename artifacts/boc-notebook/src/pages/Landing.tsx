import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Stethoscope,
  BrainCircuit,
  CalendarClock,
  LineChart,
  MessageSquareText,
  ClipboardCheck,
} from "lucide-react";

const FEATURES = [
  {
    icon: CalendarClock,
    title: "Adaptive daily plan",
    body: "A schedule that bends to your exam date and tracks every streak you build.",
  },
  {
    icon: ClipboardCheck,
    title: "Quizzes & mock exams",
    body: "Full-length, PA8-weighted practice with side-by-side retake scoring.",
  },
  {
    icon: LineChart,
    title: "Mastery & readiness",
    body: "See your domain mastery and readiness trend climb as you study.",
  },
  {
    icon: MessageSquareText,
    title: "AI tutor",
    body: "Ask anything and get athletic-training answers grounded in the blueprint.",
  },
];

export default function Landing() {
  return (
    <div className="min-h-[100dvh] bg-background text-foreground">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary">
            <Stethoscope className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="text-base font-semibold tracking-tight">
            BOC Study Notebook
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/sign-in">
            <Button size="sm" data-testid="link-sign-in">
              Sign in
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto max-w-5xl px-5 sm:px-8">
        <section className="flex flex-col items-center pt-14 pb-12 text-center sm:pt-20">
          <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
            <BrainCircuit className="h-3.5 w-3.5" />
            Built for the BOC Athletic Training exam
          </span>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
            Your private command center for{" "}
            <span className="text-primary">passing the BOC</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground sm:text-lg">
            One focused workspace for your study plan, quizzes, mock exams,
            mastery tracking, and an AI tutor — all kept private to your account.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
            <Link href="/sign-in">
              <Button size="lg" className="w-full sm:w-auto" data-testid="cta-sign-in">
                Sign in to your account
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground">
              Accounts are provisioned by your program administrator.
            </p>
          </div>
        </section>

        {/* Feature grid */}
        <section className="grid gap-4 pb-20 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card p-5 text-left"
            >
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </span>
              <h3 className="text-sm font-semibold">{f.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border px-5 py-6 text-center text-xs text-muted-foreground sm:px-8">
        BOC Study Notebook — study smarter, not longer.
      </footer>
    </div>
  );
}
