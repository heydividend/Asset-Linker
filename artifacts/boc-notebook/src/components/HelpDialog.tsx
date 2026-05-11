import { useState, type ReactNode } from "react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  HelpCircle,
  Search,
  LayoutDashboard,
  CalendarDays,
  BookText,
  Headphones,
  Brain,
  ClipboardList,
  Stethoscope,
  Activity,
  Gamepad2,
  Bot,
  Sparkles,
  Compass,
  Keyboard,
  type LucideIcon,
} from "lucide-react";
import { useTour } from "./TourProvider";

interface HelpSection {
  id: string;
  icon: LucideIcon;
  title: string;
  href?: string;
  summary: string;
  steps: string[];
  tips?: string[];
}

const SECTIONS: HelpSection[] = [
  {
    id: "dashboard",
    icon: LayoutDashboard,
    title: "Dashboard",
    href: "/",
    summary:
      "Your home base. Shows exam countdown, readiness score, today's plan, weak topics, and continue-learning shortcuts.",
    steps: [
      "Check your readiness score and exam countdown at the top.",
      'Open "Today\'s Study Plan" to do the day\'s scheduled work.',
      'Use the "View all" button on any card (Continue learning, Weak Topics, Domain Mastery) to see the full list.',
      'Click a Weak Topic to start a focused quiz on that topic.',
    ],
    tips: ["Readiness combines your mastery and recent mock-exam scores plus a small bonus for guides, podcasts, and games."],
  },
  {
    id: "schedule",
    icon: CalendarDays,
    title: "Schedule",
    href: "/schedule",
    summary:
      "Day-by-day study plan from now until your BOC exam date. Shows phase, daily focus, and time blocks.",
    steps: [
      "Browse upcoming days to preview what's coming.",
      "Click a day to see and complete its tasks.",
      "Mark items complete to update your readiness and streak.",
    ],
  },
  {
    id: "notebooks",
    icon: BookText,
    title: "Notebooks",
    href: "/notebooks",
    summary:
      "Your reference library. Each notebook holds notes, flashcards, study guides, and audio overviews on a topic.",
    steps: [
      "Create a new notebook for a domain or topic.",
      "Add notes by typing markdown or uploading files (PDF, text, screenshots).",
      "Use the Notes / Flashcards / Study guides / Audio tabs to switch views.",
      'Click "Ask AI" on any note to discuss it with the tutor.',
    ],
    tips: ["The seeded BOC Official Practice Q&A notebook contains all 173 official practice questions with rationales."],
  },
  {
    id: "study-guides",
    icon: Headphones,
    title: "Study Guides & Podcasts",
    href: "/study-guides",
    summary:
      "AI-generated study guides built from your notebook contents. Each guide can be turned into an audio overview.",
    steps: [
      'Click "Generate study guide", pick a notebook, format, and optional focus.',
      "Open a generated guide to read it.",
      'Click the headphones icon to generate a 5–10 minute podcast version you can listen to.',
    ],
  },
  {
    id: "flashcards",
    icon: Brain,
    title: "Flashcards",
    href: "/flashcards",
    summary:
      "Spaced-repetition review of every flashcard in your library, scheduled by what's due.",
    steps: [
      "Open the page to see today's due cards.",
      "Reveal the answer, then rate how well you knew it (Again / Hard / Good / Easy).",
      "Your rating updates the card's next due date automatically.",
    ],
    tips: ["Cards from the BOC practice set are pre-loaded — front shows the question, back shows the correct answer + rationale."],
  },
  {
    id: "quiz",
    icon: ClipboardList,
    title: "Practice Quizzes",
    href: "/quiz",
    summary:
      "Custom quizzes by domain, topic, or weakest areas. Tracks per-topic mastery over time.",
    steps: [
      "Pick domains and/or topics, then choose a question count.",
      "Answer each item — explanations appear after you submit.",
      "Review your results to see which topics need more work.",
    ],
    tips: ['On the Dashboard, click any Weak Topic card to launch a focused quiz on just that topic.'],
  },
  {
    id: "mock-exam",
    icon: Stethoscope,
    title: "Mock Exam",
    href: "/mock-exam",
    summary:
      "A timed full-length BOC simulation matching the real exam's blueprint and length.",
    steps: [
      'Click "Start mock exam" — chat panel auto-hides during the test.',
      "Answer questions in any order; flag items to revisit.",
      "Submit when finished to get a score, domain breakdown, and review.",
    ],
  },
  {
    id: "body-map",
    icon: Activity,
    title: "Body Map",
    href: "/body-map",
    summary:
      "Interactive anatomical reference for memorizing structures, special tests, and injuries by region.",
    steps: [
      "Click a body region to filter content to that area.",
      "Browse associated topics, special tests, and notes.",
    ],
  },
  {
    id: "games",
    icon: Gamepad2,
    title: "Games",
    href: "/games",
    summary:
      "Quick matching games for memorizing terminology, special tests, and concepts.",
    steps: [
      "Pick a game — most are matching/pair-up style.",
      "Complete sessions to add a small readiness bonus.",
    ],
  },
  {
    id: "tutor",
    icon: Bot,
    title: "AI Tutor",
    href: "/tutor",
    summary:
      "Conversational tutor focused on Athletic Training and the BOC blueprint. Available full-page or as a side panel.",
    steps: [
      "Open the AI Tutor page for a focused full-screen chat.",
      "Or use the right-side panel from anywhere — it follows you across pages.",
      'Click "Ask AI" anywhere in the app (notes, weak topics, body map) to start a chat with that context pre-loaded.',
      "Attach a PDF, screenshot, or text file with the paperclip to discuss it.",
    ],
    tips: [
      'The tutor shows a thinking indicator and types its response in real time.',
      'If you scroll up while it streams, a "Scroll to latest" button appears so you can jump back to the end.',
    ],
  },
];

const QUICK_TIPS: { icon: LucideIcon; text: ReactNode }[] = [
  { icon: Sparkles, text: <>Click <strong>Ask AI</strong> on any note, topic, or body region to chat with that context loaded.</> },
  { icon: Compass, text: <>Use <strong>Take a Tour</strong> in the sidebar for a guided walkthrough of any page.</> },
  { icon: Keyboard, text: <>Press <kbd className="rounded border bg-muted px-1 text-[10px]">Esc</kbd> to exit a tour or close a dialog.</> },
];

export function HelpDialog({ trigger }: { trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const { startTour } = useTour();

  const q = query.trim().toLowerCase();
  const filtered = q
    ? SECTIONS.filter((s) =>
        [s.title, s.summary, ...s.steps, ...(s.tips ?? [])].some((t) =>
          t.toLowerCase().includes(q),
        ),
      )
    : SECTIONS;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-primary" />
            How to use BOC Notebook
          </DialogTitle>
          <DialogDescription>
            Quick reference for every feature. Start a guided tour from the sidebar for a hands-on walkthrough.
          </DialogDescription>
          <div className="relative pt-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 mt-1 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help…"
              className="pl-8 h-8"
              data-testid="help-search-input"
            />
          </div>
        </DialogHeader>
        <ScrollArea className="max-h-[65vh] px-5 py-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No help topics match "{query}".
            </p>
          ) : (
            <div className="space-y-5" data-testid="help-sections">
              {!q && (
                <section className="rounded-md border bg-secondary/40 p-3 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Quick tips
                  </p>
                  <ul className="space-y-1.5">
                    {QUICK_TIPS.map((tip, i) => {
                      const Icon = tip.icon;
                      return (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <Icon className="h-3.5 w-3.5 mt-0.5 text-primary shrink-0" />
                          <span>{tip.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
              {filtered.map((s) => {
                const Icon = s.icon;
                return (
                  <section key={s.id} data-testid={`help-section-${s.id}`} className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold flex items-center gap-2">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        {s.title}
                      </h3>
                      {s.href && (
                        <Link href={s.href}>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground"
                            onClick={() => setOpen(false)}
                            data-testid={`help-open-${s.id}`}
                          >
                            Open
                          </Button>
                        </Link>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{s.summary}</p>
                    <ol className="list-decimal list-outside pl-5 text-sm space-y-1 marker:text-muted-foreground">
                      {s.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                    {s.tips?.map((tip, i) => (
                      <p
                        key={i}
                        className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2"
                      >
                        Tip · {tip}
                      </p>
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="px-5 py-3 border-t flex items-center justify-between gap-2 bg-muted/30">
          <p className="text-xs text-muted-foreground">
            Want a hands-on walkthrough?
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setOpen(false);
              setTimeout(() => startTour("page"), 200);
            }}
            data-testid="help-start-tour"
          >
            <Compass className="h-3.5 w-3.5 mr-1.5" />
            Tour this page
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
