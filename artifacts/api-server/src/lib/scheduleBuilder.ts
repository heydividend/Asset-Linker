import type { Domain } from "@workspace/db";
import { gameForDayIndex } from "./gamesCatalog";

export type PlanItemKind =
  | "quiz"
  | "flashcards"
  | "review"
  | "reading"
  | "audio"
  | "study_guide"
  | "resource"
  | "mock_exam"
  | "body_map"
  | "matching"
  | "study_group"
  | "review_sheet"
  | "rest"
  | "game";

export interface PlanItem {
  kind: PlanItemKind;
  title: string;
  description?: string;
  estMinutes: number;
  domainId?: number;
  topicId?: number;
  notebookId?: number;
  gameId?: string;
  link?: string;
  /** ISO date (YYYY-MM-DD) of the plan day this item belongs to. Used to make
   *  recurring items (notably the weekly simulated exams) carry a key that is
   *  unique per day, so completing one Saturday's mock doesn't mark every
   *  other mock complete and carry-forward surfaces a genuinely missed one. */
  scheduledDate?: string;
  /** ISO date (YYYY-MM-DD) this item was originally scheduled for, when it
   *  has been carried over into a later day because it wasn't completed on
   *  its original day. Undefined for items that belong to today natively. */
  carriedFrom?: string;
  /** True for the recurring 50-question daily quiz item. Its completion key is
   *  generic (`quiz:daily`) so it shows as a todo every day but never piles up
   *  via carry-forward. */
  daily?: boolean;
}

export interface ScheduleDay {
  date: string;
  dayIndex: number;
  daysToExam: number;
  phase: "foundation" | "deep_study" | "integration" | "mock_exam" | "final_review" | "rest";
  focusDomainId?: number;
  focusDomain?: string;
  title: string;
  totalMinutes: number;
  items: PlanItem[];
  isExamDay?: boolean;
  isToday?: boolean;
  isPast?: boolean;
}

export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const s = new Date(start + "T00:00:00Z");
  const e = new Date(end + "T00:00:00Z");
  for (let d = new Date(s); d <= e; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

import { todayStrPT } from "./today";
export const todayStr = todayStrPT;

// The primary BOC reference text. Daily reading assignments point here, with
// the chapters chosen to match the day's focus domain (see DOMAIN_CONTENT).
const BOOK = "Principles of Athletic Training & Therapy (Prentice, 18th ed.)";

// Domain → chapter focus + body-map regions + matching game ids.
// Keys are matched case-insensitively on a substring of the domain name.
const DOMAIN_CONTENT: Record<
  string,
  { chapters: string; regions: string[]; gameIds: string[] }
> = {
  risk: {
    chapters: "Chs 5–7, 14, 28 (nutrition, environment, PPE, infection control, skin)",
    regions: ["skin"],
    gameIds: ["ch7-equipment", "ch28-skin"],
  },
  assessment: {
    chapters: "Chs 9, 13, 18–27 (musculoskeletal trauma, off-the-field eval, regional exams)",
    regions: ["shoulder-r", "knee-r", "ankle-r", "lspine"],
    gameIds: ["mmt", "gon", "ch18-foot", "ch20-knee", "ch22-shoulder", "ch13-evaluation"],
  },
  critical: {
    chapters: "Chs 12, 25–27 (acute care, spine, head/face, thorax/abdomen emergencies)",
    regions: ["head", "cspine", "chest", "abdomen"],
    gameIds: ["ch12-acute-care", "ch25-spine", "ch27-thorax"],
  },
  therapeutic: {
    chapters: "Chs 8, 10, 15–17 (taping, tissue response, modalities, rehab, pharm)",
    regions: ["lspine", "shoulder-r", "knee-r"],
    gameIds: ["ch8-taping", "ch15-modalities", "ch16-rehab"],
  },
  healthcare: {
    chapters: "Chs 1–3, 11 (the AT role, organization, legal/insurance, psychosocial)",
    regions: [],
    gameIds: [],
  },
};

function contentFor(domainName?: string) {
  const n = (domainName ?? "").toLowerCase();
  for (const k of Object.keys(DOMAIN_CONTENT)) {
    if (n.includes(k)) return DOMAIN_CONTENT[k];
  }
  return { chapters: "core BOC content", regions: [], gameIds: [] };
}

function pick<T>(arr: T[], idx: number): T | undefined {
  if (arr.length === 0) return undefined;
  return arr[idx % arr.length];
}

export function buildSchedule(
  startDate: string,
  examDate: string,
  domains: Domain[],
  masteryByDomainId?: Map<number, number>,
): ScheduleDay[] {
  const days = eachDay(startDate, examDate);
  const today = todayStr();
  const totalDays = days.length;

  // Weakness-first priority: the lower a domain's current mastery, the more
  // focus days it earns. We still scale by the domain's BOC exam weight so a
  // heavy *and* weak domain outranks a light, weak one — but weakness is the
  // dominant factor. With no mastery data yet (mastery 0 → gap 1) priority
  // collapses back to the raw blueprint weight, so a brand-new plan still
  // mirrors the real exam's domain mix until real attempts come in.
  const priorityById = new Map<number, number>();
  for (const d of domains) {
    const m = Math.max(0, Math.min(1, masteryByDomainId?.get(d.id) ?? 0));
    const gap = 1 - m; // 0 = mastered, 1 = untouched/weak
    priorityById.set(d.id, d.weight * (0.1 + 0.9 * gap));
  }

  // Order by weakness-priority (highest first); ties fall back to exam weight
  // then id for fully deterministic output.
  const orderedDomains = [...domains].sort(
    (a, b) =>
      (priorityById.get(b.id) ?? 0) - (priorityById.get(a.id) ?? 0) ||
      b.weight - a.weight ||
      a.id - b.id,
  );

  // Allocate focus days with the D'Hondt highest-averages method over the
  // weakness-priority scores, for a deterministic, well-interleaved sequence.
  // Every domain is guaranteed at least one focus day: we *trim* the
  // lightest/strongest domains rather than dropping them from the compressed
  // window (minimums are filled first, in priority order).
  const focusByDay: (Domain | undefined)[] = [];
  if (orderedDomains.length > 0) {
    const minPerDomain = totalDays >= orderedDomains.length ? 1 : 0;
    const counts = new Map<number, number>(orderedDomains.map((d) => [d.id, 0]));
    for (let n = 0; n < totalDays; n++) {
      let best = orderedDomains[0];
      let bestScore = -Infinity;
      for (const d of orderedDomains) {
        const c = counts.get(d.id) ?? 0;
        const score =
          c < minPerDomain
            ? Number.MAX_VALUE - c
            : (priorityById.get(d.id) ?? 0) / (c + 1);
        if (score > bestScore) {
          bestScore = score;
          best = d;
        }
      }
      counts.set(best.id, (counts.get(best.id) ?? 0) + 1);
      focusByDay.push(best);
    }
  }

  // Phase boundaries. The final 7 days before the exam are the "final review"
  // window — weak-area-only review plus two extra simulated exams; earlier
  // phases fill the run-up to it.
  const lastIdx = totalDays - 1;
  const finalWeekStart = Math.max(0, lastIdx - 6); // last 7 days incl. exam day
  const integrationStart = Math.max(0, Math.floor(totalDays * 0.7));
  const deepStudyStart = Math.max(0, Math.floor(totalDays * 0.25));

  return days.map((date, i) => {
    const daysToExam = lastIdx - i;
    const isExamDay = i === lastIdx;
    const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0 Sun

    const inFinalWeek = !isExamDay && i >= finalWeekStart;
    const isDayBeforeExam = daysToExam === 1;
    // A full-length 175-question / 4-hour simulated exam runs on EVERY Saturday
    // of the plan window (except the exam day itself). The final week then
    // adds two more simulated exams — on the days 5 and 3 out from the exam —
    // on top of its weak-area-only review.
    const isWeeklyMockDay = dow === 6 && !isExamDay && !inFinalWeek;
    const isFinalWeekMockDay = inFinalWeek && (daysToExam === 5 || daysToExam === 3);
    const isMockDay = isWeeklyMockDay || isFinalWeekMockDay;

    let phase: ScheduleDay["phase"];
    if (isExamDay) phase = "mock_exam";
    else if (isMockDay) phase = "mock_exam";
    else if (inFinalWeek) phase = "final_review";
    else if (i >= integrationStart) phase = "integration";
    else if (i >= deepStudyStart) phase = "deep_study";
    else phase = "foundation";

    const focusDomain = focusByDay[i];
    const content = contentFor(focusDomain?.name);
    const region = pick(content.regions, i);
    const gameId = pick(content.gameIds, i);

    // Reading assignment from the BOC text, matched to today's focus domain.
    const readingItem: PlanItem = {
      kind: "reading",
      title: `Read the BOC text — ${content.chapters}`,
      description: `${BOOK}${
        focusDomain?.name ? ` — matches today's focus: ${focusDomain.name}.` : "."
      }`,
      estMinutes: 30,
      domainId: focusDomain?.id,
      link: "/notebooks",
    };

    const items: PlanItem[] = [];
    let title = "";

    if (isExamDay) {
      title = "Exam Day — light review only";
      items.push(
        { kind: "review", title: "Light morning review of formula sheets and red-flag lists", estMinutes: 20 },
        { kind: "rest", title: "Hydrate, eat well, arrive 30 min early", estMinutes: 0 },
      );
    } else if (isMockDay) {
      // Full-length simulated exam day (weekly Saturday, or one of the two
      // extra final-week sims). The mock item carries its scheduledDate so its
      // completion key is unique per day.
      title = isFinalWeekMockDay
        ? "Final-week simulated exam"
        : "Full-length Simulated Exam";
      items.push(
        {
          kind: "mock_exam",
          title: "Take a 175-question, 4-hour simulated exam",
          description:
            "Strict 4-hour timing, 175 questions, no back-nav — mirror real BOC test conditions.",
          estMinutes: 240,
          scheduledDate: date,
          link: "/mock-exam",
        },
        {
          kind: "review",
          title: "Review every missed question with the AI tutor",
          description: isFinalWeekMockDay
            ? "Concentrate on your weakest domains and the items you missed."
            : undefined,
          estMinutes: 60,
          link: "/tutor",
        },
      );
    } else if (inFinalWeek) {
      if (isDayBeforeExam) {
        // The day before the exam is intentionally light — no cramming.
        title = "Light review — no cramming";
        items.push(
          {
            kind: "review",
            title: "Skim your formula sheets and red-flag lists",
            estMinutes: 25,
          },
          {
            kind: "flashcards",
            title: "Light confidence-only flashcard sweep",
            estMinutes: 15,
            link: "/flashcards",
          },
          {
            kind: "rest",
            title: "Rest, hydrate, prep your materials, and sleep early",
            estMinutes: 0,
          },
        );
      } else {
        // Weak-area-only review across the rest of the final week.
        title = `Weak-area review — ${focusDomain?.name ?? "weakest domains"}`;
        items.push(
          {
            kind: "quiz",
            title: "40-question weak-area quiz",
            description:
              "Targeted at your lowest-mastery topics across all 5 domains.",
            estMinutes: 45,
            domainId: focusDomain?.id,
            link: "/quiz",
          },
          { kind: "flashcards", title: "Sweep ALL due flashcards", estMinutes: 30, link: "/flashcards" },
          {
            kind: "review",
            title: `Re-read ${focusDomain?.name ?? "weak"} study guides (${content.chapters})`,
            estMinutes: 25,
            domainId: focusDomain?.id,
          },
          {
            kind: "body_map",
            title: "Whole-body red-flag walkthrough",
            description: "Tap each region — recite emergency action and one high-yield fact.",
            estMinutes: 20,
            link: "/body-map",
          },
        );
      }
    } else if (phase === "integration") {
      title = `Integration — ${focusDomain?.name}`;
      items.push(
        readingItem,
        {
          kind: "quiz",
          title: `Topic quiz: ${focusDomain?.name}`,
          description: content.chapters,
          estMinutes: 25,
          domainId: focusDomain?.id,
          link: "/quiz",
        },
        {
          kind: "flashcards",
          title: "Spaced-repetition session",
          estMinutes: 20,
          link: "/flashcards",
        },
        {
          kind: "audio",
          title: `Audio overview while commuting`,
          description: "Generate or listen to an existing audio overview for this domain.",
          estMinutes: 15,
        },
        {
          kind: "review",
          title: "Practice case scenarios with the AI tutor",
          description: "Ask for 3 BOC-style case vignettes in this domain.",
          estMinutes: 30,
          domainId: focusDomain?.id,
          link: "/tutor",
        },
      );
      if (region) {
        items.push({
          kind: "body_map",
          title: `Body map drill: ${region.replace(/-/g, " ")}`,
          description: "Recite injuries, red flags, and on-field management for this region.",
          estMinutes: 10,
          link: "/body-map",
        });
      }
      if (gameId) {
        items.push({
          kind: "matching",
          title: `Matching game: ${gameId.replace(/-/g, " ")}`,
          estMinutes: 8,
          link: `/games/${gameId}`,
        });
      }
    } else if (phase === "deep_study") {
      title = `Deep Study — ${focusDomain?.name}`;
      items.push(
        readingItem,
        {
          kind: "study_guide",
          title: `Study ${focusDomain?.name} — ${content.chapters}`,
          description: "Open the matching notebook(s) and generate or revisit a guide.",
          estMinutes: 45,
          domainId: focusDomain?.id,
        },
        {
          kind: "flashcards",
          title: "Review due cards + add 10 new from today's reading",
          estMinutes: 25,
          link: "/flashcards",
        },
        {
          kind: "quiz",
          title: `15-question domain quiz`,
          estMinutes: 20,
          domainId: focusDomain?.id,
          link: "/quiz",
        },
      );
      if (gameId) {
        items.push({
          kind: "matching",
          title: `Matching game: ${gameId.replace(/-/g, " ")}`,
          description: "Reinforce the day's terminology with image-based matching.",
          estMinutes: 8,
          link: `/games/${gameId}`,
        });
      }
      if (region) {
        items.push({
          kind: "body_map",
          title: `Body map: open the ${region.replace(/-/g, " ")} region`,
          description: "Walk through evaluation, red flags, and treatment.",
          estMinutes: 10,
          link: "/body-map",
        });
      }
    } else {
      // foundation
      title = `Foundation — ${focusDomain?.name}`;
      items.push(
        readingItem,
        {
          kind: "study_guide",
          title: `Read overview: ${focusDomain?.name} (${content.chapters})`,
          estMinutes: 35,
          domainId: focusDomain?.id,
        },
        {
          kind: "flashcards",
          title: "Build initial flashcard set",
          description: "Generate flashcards from your notes for this domain.",
          estMinutes: 20,
          link: "/flashcards",
        },
        {
          kind: "quiz",
          title: "10-question warm-up quiz",
          estMinutes: 15,
          domainId: focusDomain?.id,
          link: "/quiz",
        },
      );
      if (region) {
        items.push({
          kind: "body_map",
          title: `Body map preview: ${region.replace(/-/g, " ")}`,
          estMinutes: 8,
          link: "/body-map",
        });
      }
    }

    // Rest day on Sundays during foundation/deep_study (but not in the final
    // week, on simulated-exam days, or during integration).
    const isRestDay =
      !isExamDay &&
      !isMockDay &&
      !inFinalWeek &&
      dow === 0 &&
      phase !== "final_review" &&
      phase !== "integration";
    if (isRestDay) {
      title = "Light Rest Day";
      items.length = 0;
      items.push(
        { kind: "flashcards", title: "Quick 10-minute flashcard sweep", estMinutes: 10, link: "/flashcards" },
        { kind: "matching", title: "One matching game of your choice", estMinutes: 8, link: "/games" },
        { kind: "rest", title: "Recover. Hydrate. Walk. Sleep early.", estMinutes: 0 },
      );
    }

    // The 50-question original BOC-style daily quiz: a recurring item on every
    // active study day (not exam day, simulated-exam days, the rest day, or the
    // intentionally-light day before the exam). It's freshly generated each day,
    // mixed across all 5 domains and weighted toward weak areas, feeding
    // per-domain mastery and detailed explanations.
    const isActiveStudyDay =
      !isExamDay && !isMockDay && !isRestDay && !isDayBeforeExam;
    if (isActiveStudyDay) {
      items.push({
        kind: "quiz",
        title: "Daily 50-question BOC-style quiz",
        description:
          "Fresh AI-generated set mixed across all 5 domains and weighted toward your weak areas — counts toward per-domain mastery.",
        estMinutes: 50,
        daily: true,
        link: "/daily-quiz",
      });

      // Concise high-yield review sheet for today's focus domain.
      if (focusDomain) {
        items.push({
          kind: "review_sheet",
          title: `High-yield review sheet — ${focusDomain.name}`,
          description: "Skim the concise, exam-focused review sheet for today's domain.",
          estMinutes: 15,
          domainId: focusDomain.id,
          link: `/review-sheets/${focusDomain.code}`,
        });
      }
    }

    // Inject a daily matching-game item on every active study day. Games are
    // mandatory in the daily mix per the BOC plan, so we also include them on
    // light/rest Sundays. Skip only the actual exam day, where the day is
    // intentionally "light review only".
    if (!isExamDay) {
      const g = gameForDayIndex(i);
      items.push({
        kind: "game",
        title: `Quick game: ${g.title}`,
        description: "Image-matching round to lock in visual recall.",
        estMinutes: g.estMinutes,
        gameId: g.id,
        link: `/games/${g.id}`,
      });
    }

    // Mandatory daily AI Study Group session. Skipped only on exam day. If
    // not completed, the carry-forward logic in /plan/today (in plan.ts)
    // surfaces it on the following day until the user finishes it.
    if (!isExamDay) {
      items.push({
        kind: "study_group",
        title: focusDomain?.name
          ? `AI study group session — ${focusDomain.name}`
          : "AI study group session",
        description:
          "Run at least one round with the AI study group to talk through today's focus.",
        estMinutes: 25,
        domainId: focusDomain?.id,
        link: "/study-group",
      });
    }

    const totalMinutes = items.reduce((s, it) => s + it.estMinutes, 0);

    return {
      date,
      dayIndex: i,
      daysToExam,
      phase,
      focusDomainId: focusDomain?.id,
      focusDomain: focusDomain?.name,
      title,
      totalMinutes,
      items,
      isExamDay,
      isToday: date === today,
      isPast: date < today,
    };
  });
}
