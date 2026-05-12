import type { DriveStep } from "driver.js";

export type PageKey =
  | "sidebar"
  | "dashboard"
  | "schedule"
  | "notebooks"
  | "notebookDetail"
  | "flashcards"
  | "quiz"
  | "quizRun"
  | "mockExam"
  | "mockRun"
  | "bodyMap"
  | "games"
  | "tutor";

/** A driver.js step with an optional async pre-action that mutates the page
 *  so the targeted element is on screen (e.g. opening a tab, clicking
 *  "reveal", expanding a popover). Resolved in TourProvider before highlight. */
export type BocStep = DriveStep & {
  ensureVisible?: () => Promise<void> | void;
};

export interface PageDef {
  key: PageKey;
  label: string;
  match: (location: string) => boolean;
  defaultPath: string;
  prepare?: () => Promise<{ skip?: boolean; reason?: string; navigateTo?: string }>;
  steps: () => BocStep[];
  readyDelayMs?: number;
  /** Run when this page's tour finishes (success, skip, or close). Use it to
   *  tear down any tour-only UI state, e.g. preview cards seeded for the tour. */
  cleanup?: () => void;
}

const baseSidePopover = (title: string, description: string): DriveStep["popover"] => ({
  title,
  description,
  side: "right",
  align: "start",
});

const centerPopover = (title: string, description: string): DriveStep["popover"] => ({
  title,
  description,
});

async function waitFor(selector: string, timeoutMs = 1500): Promise<Element | null> {
  const start = performance.now();
  while (performance.now() - start < timeoutMs) {
    const el = document.querySelector(selector);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 50));
  }
  return document.querySelector(selector);
}

function sidebarSteps(): BocStep[] {
  return [
    {
      element: '[data-tour="sidebar-nav"]',
      popover: baseSidePopover(
        "The sidebar",
        "Every part of BOC Notebook lives here — Dashboard, Schedule, Notebooks, Flashcards, Quizzes, Mock Exam, Body Map, Games, and the AI Tutor. Click any item to jump straight in.",
      ),
    },
    {
      element: '[data-testid="button-collapse-sidebar"]',
      popover: baseSidePopover(
        "Collapse the sidebar",
        "Need more room? Hide the sidebar with this button. A floating menu icon appears in the bottom-left to bring it back, plus a compass icon to launch the tour again.",
      ),
    },
    {
      element: '[data-testid="resize-handle-sidebar"]',
      popover: baseSidePopover(
        "Resize it",
        "Drag this thin edge to widen or narrow the sidebar to whatever feels right.",
      ),
    },
    {
      element: '[data-tour="sidebar-take-tour"]',
      popover: baseSidePopover(
        "Take a Tour any time",
        "Re-run a tour whenever you want — pick a quick walkthrough of just the page you're on, or the whole app from start to finish. Press <kbd>Esc</kbd> to skip out.",
      ),
    },
  ];
}

function dashboardSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Welcome to your Dashboard",
        "This is mission control. You'll see your countdown to exam day, today's plan, where you're strong, and where you need work — all in one place.",
      ),
    },
    {
      element: '[data-tour="dashboard-countdown"]',
      popover: { title: "Exam countdown", description: "Days remaining until your BOC exam plus how far along you are. The little day chips below jump straight to that day in your full schedule." },
    },
    {
      element: '[data-tour="dashboard-readiness"]',
      popover: { title: "BOC Readiness score", description: "A 0–100 estimate of how exam-ready you are right now, based on your quiz history, mastery, and review consistency." },
    },
    {
      element: '[data-tour="dashboard-streak"]',
      popover: { title: "Study streak", description: "Consecutive days you've completed at least some study. Keep it alive — even a short Fix-It session counts." },
    },
    {
      element: '[data-testid="fix-it-plan-card"]',
      popover: { title: "Today's Fix-It Plan", description: "One focused micro-quiz on your weakest body region — the fastest way to nudge mastery up. Finish it and watch your streak grow." },
    },
    {
      element: '[data-tour="dashboard-today-plan"]',
      popover: { title: "Today's study plan", description: "The day's tasks pulled from your full study schedule. Click Start on any item to dive into the right tool." },
    },
    {
      element: '[data-testid="weak-topics-list"]',
      popover: { title: "Weak topics", description: "Your lowest-mastery topics, ranked. Each row has a 5 / 10 / 20-question quick-quiz selector — pick a count and launch a focused quiz on that topic in one click." },
    },
    {
      element: '[data-tour="dashboard-domain-mastery"]',
      popover: { title: "Domain mastery", description: "Your accuracy across the five BOC domains. The Last-N selector tunes the trend window. Click a domain bar to launch a quick quiz on it." },
    },
    {
      element: '[data-testid="dashboard-trend-window"]',
      popover: { title: "Trend window", description: "Switch between the last 3, 5, 10, or 20 attempts to see short-term momentum vs. longer-term mastery trends across your domain charts." },
    },
  ];
}

function scheduleSteps(): BocStep[] {
  return [
    {
      element: '[data-tour="schedule-header"]',
      popover: { title: "Your study schedule", description: "Days remaining, overall progress, and the window from your start date to exam day." },
    },
    {
      element: '[data-testid="button-edit-schedule"]',
      popover: { title: "Edit your dates", description: "Change your start or exam date and the whole multi-phase plan rebuilds automatically." },
    },
    {
      element: '[data-tour="schedule-days"]',
      popover: { title: "Day-by-day plan", description: "Each card is a study day with its phase (Foundation → Deep Study → Integration → Final Review → Exam Day). Today is highlighted with a blue stripe." },
    },
    {
      element: '[data-tour="schedule-day-items"]',
      popover: { title: "Daily objectives", description: "The exact tasks for that day — flashcards, quizzes, study guides, audio overviews, mock exams. Each Start button opens the right tool, pre-filtered." },
    },
  ];
}

function notebooksSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Notebooks",
        "Group your study material — typed notes, pasted text, PDFs — into notebooks. Each notebook is a workspace where AI can generate flashcards, study guides, audio overviews, and quizzes from your content.",
      ),
    },
    {
      element: '[data-testid="btn-new-notebook"]',
      popover: { title: "Create a notebook", description: "Start an empty notebook — give it a title like 'Therapeutic Modalities' and add notes inside." },
    },
    {
      element: '[data-testid="btn-import-pdf"]',
      popover: { title: "Import a PDF", description: "Upload a PDF, TXT, or Markdown file and it becomes a note inside a new or existing notebook — instantly searchable and AI-ready." },
    },
    {
      element: '[data-tour="notebooks-grid"]',
      popover: { title: "Your notebooks", description: "Click any notebook to open its workspace. The badges show note and flashcard counts at a glance." },
    },
  ];
}

function notebookDetailSteps(): BocStep[] {
  return [
    {
      element: '[data-tour="notebook-sources"]',
      popover: { title: "Sources", description: "Every note, paste, or imported file lives here. Click one on the left to read it on the right.", side: "right", align: "start" },
    },
    {
      element: '[data-testid="button-add-note"]',
      popover: { title: "Add new sources", description: "Type a note, paste material, or save a URL. Each source gets indexed so the AI can use it." },
    },
    {
      element: '[data-tour="notebook-tabs"]',
      popover: { title: "Workspace tabs", description: "Switch between your Notes, AI-generated Flashcards tied to topics, Study Guides (outline / summary / Q&A / mind-map), and Audio overviews." },
    },
    {
      element: '[data-testid="button-quiz-from-notebook"]',
      popover: { title: "Quiz from this notebook", description: "Generates a 10-question practice quiz pulled from the topics in this notebook — perfect for active recall after reading." },
    },
    {
      element: '[data-testid="tab-audio"]',
      popover: { title: "Audio overviews", description: "Open the Audio tab to generate an AI-narrated lecture, podcast, or quick-recap version of this notebook — perfect for review on the go.", side: "bottom" },
      ensureVisible: async () => {
        const tab = document.querySelector<HTMLElement>('[data-testid="tab-audio"]');
        tab?.click();
      },
    },
    {
      element: '[data-testid="button-generate-audio"]',
      popover: { title: "Generate audio", description: "Pick a voice and a style (lecture, podcast, or quick recap) and the AI narrates this notebook for you. The clip lands here when ready and plays inline.", side: "bottom" },
      ensureVisible: async () => {
        const tab = document.querySelector<HTMLElement>('[data-testid="tab-audio"]');
        tab?.click();
        await waitFor('[data-testid="button-generate-audio"]', 1000);
      },
    },
    {
      element: '[data-testid="button-open-notebook-tutor"]',
      popover: { title: "Chat about this notebook", description: "Open the AI Tutor with this notebook's sources already in context — ask for explanations, mnemonics, or a custom quiz." },
    },
  ];
}

function activateFlashcardPreview(revealed: boolean): void {
  window.dispatchEvent(
    new CustomEvent("boc:tour:flashcards:preview", { detail: { revealed } }),
  );
}

function setFlashcardPreviewRevealed(revealed: boolean): void {
  window.dispatchEvent(
    new CustomEvent("boc:tour:flashcards:reveal", { detail: { revealed } }),
  );
}

function flashcardsSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Flashcards",
        "Spaced-repetition flashcards built from your notebooks. Cards become due on a smart schedule based on how well you've remembered them.<br/><br/><em>For this walkthrough we're showing a sample card — your real deck isn't affected.</em>",
      ),
      ensureVisible: async () => {
        activateFlashcardPreview(false);
        await waitFor('[data-testid="badge-due-count"]', 1500);
      },
    },
    {
      element: '[data-testid="badge-due-count"]',
      popover: { title: "Cards due today", description: "How many cards are scheduled for review right now. The number drops as you rate cards." },
      ensureVisible: async () => {
        activateFlashcardPreview(false);
        await waitFor('[data-testid="badge-due-count"]', 1500);
      },
    },
    {
      element: '[data-testid="button-generate-flashcards"]',
      popover: { title: "Generate AI flashcards", description: "Pick a notebook and let the AI create exam-ready cards with topic tags. Optionally focus on a topic like 'concussion management'." },
      ensureVisible: async () => {
        activateFlashcardPreview(false);
        await waitFor('[data-testid="button-generate-flashcards"]', 1500);
      },
    },
    {
      element: '[data-testid="button-browse-all"]',
      popover: { title: "Browse all", description: "Flip through every card in your deck (no SRS scoring). Great for a quick refresher before bed." },
      ensureVisible: async () => {
        activateFlashcardPreview(false);
        await waitFor('[data-testid="button-browse-all"]', 1500);
      },
    },
    {
      element: '[data-testid="button-reveal"]',
      popover: { title: "Reveal the answer", description: "Read the front, think through your answer, then click Reveal to flip the card.", side: "top" },
      ensureVisible: async () => {
        setFlashcardPreviewRevealed(false);
        await waitFor('[data-testid="button-reveal"]', 1500);
      },
    },
    {
      element: '[data-testid="button-ask-ai"]',
      popover: { title: "Stuck? Ask AI", description: "Pop open a focused chat about the current card — the AI Tutor receives the front, back, and any region context, and explains it deeply with clinical scenarios.", side: "left" },
    },
    {
      element: '[data-testid="button-rate-good"]',
      popover: {
        title: "Rate yourself honestly",
        description: "After flipping, four buttons appear: Again (forgot) · Hard · Good · Easy. Your rating sets when this card is due next — Good means you'll see it again in a few days, Easy pushes it weeks out.",
        side: "top",
      },
      ensureVisible: async () => {
        setFlashcardPreviewRevealed(true);
        await waitFor('[data-testid="button-rate-good"]', 1500);
      },
    },
  ];
}

function flashcardsCleanup(): void {
  window.dispatchEvent(new Event("boc:tour:flashcards:end"));
}

function quizSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Practice quizzes",
        "Short, focused quizzes from the BOC question bank. Use them as active recall throughout your study cycle.",
      ),
    },
    {
      element: '[data-testid="select-mode"]',
      popover: { title: "Pick a mode", description: "Adaptive targets your weak areas. Or quiz by domain (D1–D5), by a single topic, or just drill weaknesses." },
    },
    {
      element: '[data-testid="select-count"]',
      popover: { title: "Question count", description: "5 for a warm-up, 20 for a serious workout. Most people land on 10 for a daily session." },
    },
    {
      element: '[data-testid="button-start-quiz"]',
      popover: { title: "Start the quiz", description: "After you answer each question, you'll see a rationale, source, and an Ask AI button to dig deeper. Coach tips appear before and after each answer." },
    },
    {
      element: '[data-tour="quiz-recent"]',
      popover: { title: "Recent attempts", description: "Resume in-progress quizzes or revisit completed ones to review every question and rationale." },
    },
  ];
}

function activateQuizRunPreview(): void {
  (window as unknown as { __bocTourQuizRunPreview?: boolean }).__bocTourQuizRunPreview = true;
  window.dispatchEvent(new Event("boc:tour:quizrun:preview"));
}

function quizRunCleanup(): void {
  (window as unknown as { __bocTourQuizRunPreview?: boolean }).__bocTourQuizRunPreview = false;
  window.dispatchEvent(new Event("boc:tour:quizrun:end"));
}

function quizRunSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "You're inside a quiz",
        "Read the stem, pick the best choice. Once you answer, the correct option, rationale, and an Ask-AI button appear so you can learn from each item — right and wrong.<br/><br/><em>For this walkthrough we're showing a sample question — your real quiz history isn't affected.</em>",
      ),
    },
    {
      element: '[data-testid="text-question-stem"]',
      popover: { title: "Question stem", description: "The full BOC-style scenario. Watch for clinical clues, ages, and red-flag wording." },
    },
    {
      element: '[data-testid="choice-0"]',
      popover: { title: "Choices", description: "Click any choice to lock in your answer. Until you answer there's no penalty for changing — once submitted, the rationale appears below.", side: "bottom" },
    },
    {
      element: '[data-testid="button-next-question"]',
      popover: { title: "Next question", description: "Advance to the next item once you've absorbed the rationale. Use 'Skip to unanswered' if you've jumped around." },
    },
    {
      element: '[data-testid="button-finish-quiz"]',
      popover: { title: "Finish & review", description: "When the last question is answered, finish to see your score, per-domain breakdown, and a per-question review with rationales and trend popovers." },
    },
    {
      element: '[data-testid="button-exit-quiz"]',
      popover: { title: "Save & exit anytime", description: "Need to step away? Exit saves your progress so you can resume from the Recent attempts list." },
    },
  ];
}

function activateMockRunPreview(): void {
  (window as unknown as { __bocTourMockRunPreview?: boolean }).__bocTourMockRunPreview = true;
  window.dispatchEvent(new Event("boc:tour:mockrun:preview"));
}

function mockRunCleanup(): void {
  (window as unknown as { __bocTourMockRunPreview?: boolean }).__bocTourMockRunPreview = false;
  window.dispatchEvent(new Event("boc:tour:mockrun:end"));
}

function mockExamSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Mock Exam",
        "A timed simulation of the real BOC exam — full domain coverage, strict timer, no back-navigation. Use it as a pressure test, not a daily drill.",
      ),
    },
    {
      element: '[data-tour="mock-howitworks"]',
      popover: { title: "How it works", description: "Questions are sampled across all five BOC domains in their real exam weights, with a strict timer that auto-submits when it hits zero. Pass threshold is 75%." },
    },
    {
      element: '[data-testid="input-total-questions"]',
      popover: { title: "Total questions", description: "175 mirrors the real BOC. Drop it lower for a quick mock when time is tight." },
    },
    {
      element: '[data-testid="input-time-limit"]',
      popover: { title: "Time limit", description: "Set in seconds. The countdown runs once you start — no pausing." },
    },
    {
      element: '[data-testid="button-start-mock-exam"]',
      popover: { title: "Start the mock exam", description: "After you submit (or time runs out), you'll see your score, per-domain breakdown, and the weakest topics to focus on next." },
    },
  ];
}

function mockRunSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Mock exam in progress",
        "This is a strict simulation. The timer doesn't pause and you can't go back to past questions — just like the real BOC.",
      ),
    },
    {
      element: '[data-testid="text-timer"]',
      popover: { title: "Countdown timer", description: "Time remaining. It turns red in the final 10 minutes. When it hits zero the exam auto-submits with whatever you've answered.", side: "bottom" },
    },
    {
      element: '[data-testid="text-mock-stem"]',
      popover: { title: "Question stem", description: "Read carefully — there are no rationales mid-exam. You'll review every item afterward." },
    },
    {
      element: '[data-testid="mock-choice-0"]',
      popover: { title: "Pick a choice", description: "Lock in your best answer. Then advance — there is no going back to change it.", side: "bottom" },
    },
    {
      element: '[data-testid="button-mock-next"]',
      popover: { title: "Next question", description: "Move forward through the exam. The Submit button finishes early; otherwise the timer or your last answer ends the run." },
    },
    {
      element: '[data-testid="button-submit-exam"]',
      popover: { title: "Submit exam", description: "Submit any time after you've answered the current question. You'll get your overall score, per-domain breakdown, and the weakest topics to drill next." },
    },
  ];
}

function bodyMapSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Clinical Body Map",
        "An anatomical view of where your study weaknesses live. Hover or click body regions to see common injuries, your mastery, and to jump into focused practice.",
      ),
    },
    {
      element: '[data-testid="tab-anterior"]',
      popover: { title: "Anterior / Posterior", description: "Flip between the front and back views. Different regions live on each side." },
    },
    {
      element: '[data-tour="bodymap-layers"]',
      popover: { title: "Anatomical layers", description: "Toggle Surface, Muscular, and Skeleton layers and tune their opacity to peel from skin to bone.", side: "right", align: "start" },
    },
    {
      element: '[data-tour="bodymap-presets"]',
      popover: { title: "Preset views", description: "Quick presets — Skin, Muscle, Skeleton, or X-ray — instantly set sensible opacity combos." },
    },
    {
      element: '[data-testid="body-viewer"]',
      popover: { title: "Click a region", description: "Each highlighted hot-zone is a clinical region. Hover for a quick mastery tooltip with your trend and a one-click Drill button to launch a focused quiz; click the region to open the full panel — injuries, special tests, treatment, and an Ask-AI button per item." },
    },
    {
      element: '[data-tour="bodymap-region-list"]',
      popover: { title: "Region list", description: "Same regions as a scrollable list with mastery badges. Weak regions get a red 'Review weak spots' shortcut into focused flashcards.", side: "left", align: "start" },
    },
  ];
}

function gamesSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "Games",
        "Lightweight matching games to break up heavy study. They reinforce visual recognition for things like special tests, modalities, and anatomy.",
      ),
    },
    {
      element: '[data-tour="games-grid"]',
      popover: { title: "Pick a game", description: "Each card shows the game name, a short description, and how many pairs you'll match. Click Play to start." },
    },
  ];
}

function tutorSteps(): BocStep[] {
  return [
    {
      popover: centerPopover(
        "AI Tutor",
        "A focused chat with an AI tutor that knows the BOC exam. Ask it to explain a concept, generate a quiz, or quiz you on something you just read.",
      ),
    },
    {
      element: '[data-testid="button-new-conversation"]',
      popover: { title: "Start a new chat", description: "Each chat keeps its own history so you can have one for cardio, one for orthopedics, one for review.", side: "right", align: "start" },
    },
    {
      element: '[data-testid="button-tutor-attach"]',
      popover: { title: "Attach a file", description: "Drop in a PDF, text file, or image and ask questions about it. With save-to-library on, it also lands in your Notebooks." },
    },
    {
      element: '[data-testid="input-tutor-message"]',
      popover: { title: "Ask anything", description: "Try things like: 'Quiz me on 5 hamstring strain scenarios with rationales' or 'Explain modalities indications in plain English'." },
    },
    {
      element: '[data-testid="button-tutor-send"]',
      popover: { title: "Send", description: "Press Enter or click Send. Replies stream in real time so you can read as the tutor types." },
    },
  ];
}

export const PAGES: Record<PageKey, PageDef> = {
  sidebar: {
    key: "sidebar",
    label: "Sidebar & navigation",
    match: () => true,
    defaultPath: "/",
    steps: sidebarSteps,
  },
  dashboard: {
    key: "dashboard",
    label: "Dashboard",
    match: (loc) => loc === "/" || loc === "",
    defaultPath: "/",
    steps: dashboardSteps,
  },
  schedule: {
    key: "schedule",
    label: "Schedule",
    match: (loc) => loc.startsWith("/schedule"),
    defaultPath: "/schedule",
    steps: scheduleSteps,
  },
  notebooks: {
    key: "notebooks",
    label: "Notebooks",
    match: (loc) => loc === "/notebooks",
    defaultPath: "/notebooks",
    steps: notebooksSteps,
  },
  notebookDetail: {
    key: "notebookDetail",
    label: "Notebook workspace",
    match: (loc) => /^\/notebooks\/\d+/.test(loc),
    defaultPath: "/notebooks",
    readyDelayMs: 700,
    prepare: async () => {
      try {
        const res = await fetch("/api/notebooks");
        if (!res.ok) throw new Error("notebooks fetch failed");
        const list = (await res.json()) as Array<{ id: number }>;
        const first = Array.isArray(list) ? list[0] : null;
        if (!first?.id) {
          return {
            skip: true,
            reason:
              "You don't have any notebooks yet — create one from the Notebooks page and the workspace tour will be available next time.",
          };
        }
        return { navigateTo: `/notebooks/${first.id}` };
      } catch {
        return {
          skip: true,
          reason:
            "Couldn't load your notebooks just now — open one manually and re-run this tour from the sidebar.",
        };
      }
    },
    steps: notebookDetailSteps,
  },
  flashcards: {
    key: "flashcards",
    label: "Flashcards",
    match: (loc) => loc.startsWith("/flashcards"),
    defaultPath: "/flashcards",
    steps: flashcardsSteps,
    cleanup: flashcardsCleanup,
  },
  quiz: {
    key: "quiz",
    label: "Practice quizzes",
    match: (loc) => loc === "/quiz",
    defaultPath: "/quiz",
    steps: quizSteps,
  },
  quizRun: {
    key: "quizRun",
    label: "Quiz in progress",
    match: (loc) => /^\/quiz\/\d+/.test(loc),
    defaultPath: "/quiz/0",
    readyDelayMs: 500,
    prepare: async () => {
      const path = window.location.pathname;
      // Real, in-progress quiz: don't seed a sample.
      if (/^\/quiz\/[1-9]\d*/.test(path)) return {};
      // Otherwise navigate to the sentinel /quiz/0 route and let
      // QuizRunner render a tour-only sample question.
      activateQuizRunPreview();
      return { navigateTo: "/quiz/0" };
    },
    steps: quizRunSteps,
    cleanup: quizRunCleanup,
  },
  mockExam: {
    key: "mockExam",
    label: "Mock exam",
    match: (loc) => loc === "/mock-exam",
    defaultPath: "/mock-exam",
    steps: mockExamSteps,
  },
  mockRun: {
    key: "mockRun",
    label: "Mock exam in progress",
    match: (loc) => /^\/mock-exam\/\d+/.test(loc),
    defaultPath: "/mock-exam/0",
    readyDelayMs: 500,
    prepare: async () => {
      const path = window.location.pathname;
      // Real, in-progress mock exam: don't seed a sample.
      if (/^\/mock-exam\/[1-9]\d*/.test(path)) return {};
      // Otherwise navigate to the sentinel /mock-exam/0 route and let
      // MockExamRunner render a tour-only sample question.
      activateMockRunPreview();
      return { navigateTo: "/mock-exam/0" };
    },
    steps: mockRunSteps,
    cleanup: mockRunCleanup,
  },
  bodyMap: {
    key: "bodyMap",
    label: "Body map",
    match: (loc) => loc.startsWith("/body-map"),
    defaultPath: "/body-map",
    steps: bodyMapSteps,
  },
  games: {
    key: "games",
    label: "Games",
    match: (loc) => loc === "/games",
    defaultPath: "/games",
    steps: gamesSteps,
  },
  tutor: {
    key: "tutor",
    label: "AI tutor",
    match: (loc) => loc === "/tutor",
    defaultPath: "/tutor",
    steps: tutorSteps,
  },
};

/** Order pages run in for the full app tour. Runner pages (quizRun, mockRun)
 *  prepare() skips with a friendly note when there's no active attempt. */
export const ALL_TOUR_QUEUE: PageKey[] = [
  "dashboard",
  "sidebar",
  "schedule",
  "notebooks",
  "notebookDetail",
  "flashcards",
  "quiz",
  "quizRun",
  "mockExam",
  "mockRun",
  "bodyMap",
  "games",
  "tutor",
];

/** Pick the page matching the current wouter location. Runner pages first
 *  so /quiz/123 doesn't fall through to /quiz. */
export function pageForLocation(location: string): PageKey | null {
  const order: PageKey[] = [
    "quizRun",
    "mockRun",
    "notebookDetail",
    "notebooks",
    "schedule",
    "flashcards",
    "quiz",
    "mockExam",
    "bodyMap",
    "games",
    "tutor",
    "dashboard",
  ];
  for (const k of order) {
    if (PAGES[k].match(location)) return k;
  }
  return null;
}

export const TOUR_SEEN_KEY = "boc:tour:seen:v1";
export const TOUR_COMPLETED_KEY = "boc:tour:completed:v1";

/** Pages whose completion counts toward "all tours done". The runner pages
 *  (quizRun/mockRun) are excluded because they intentionally skip when no
 *  attempt is in progress and would otherwise be impossible to "complete". */
export const TRACKABLE_PAGES: PageKey[] = ALL_TOUR_QUEUE.filter(
  (k) => k !== "quizRun" && k !== "mockRun",
);

export function getCompletedTours(): Set<PageKey> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(TOUR_COMPLETED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((v): v is PageKey => typeof v === "string" && v in PAGES));
  } catch {
    return new Set();
  }
}

export function markTourCompleted(key: PageKey): void {
  if (typeof window === "undefined") return;
  const done = getCompletedTours();
  if (done.has(key)) return;
  done.add(key);
  try {
    window.localStorage.setItem(
      TOUR_COMPLETED_KEY,
      JSON.stringify(Array.from(done)),
    );
    window.dispatchEvent(new Event("boc:tour:progress"));
  } catch {
    /* ignore */
  }
}

export function clearCompletedTours(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(TOUR_COMPLETED_KEY);
    window.dispatchEvent(new Event("boc:tour:progress"));
  } catch {
    /* ignore */
  }
}

export interface TourProgress {
  completed: PageKey[];
  remaining: PageKey[];
  total: number;
  done: boolean;
}

export function getTourProgress(): TourProgress {
  const done = getCompletedTours();
  const completed = TRACKABLE_PAGES.filter((k) => done.has(k));
  const remaining = TRACKABLE_PAGES.filter((k) => !done.has(k));
  return {
    completed,
    remaining,
    total: TRACKABLE_PAGES.length,
    done: remaining.length === 0,
  };
}
