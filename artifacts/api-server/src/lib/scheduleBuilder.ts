import type { Domain } from "@workspace/db";

export type PlanItemKind =
  | "quiz"
  | "flashcards"
  | "review"
  | "audio"
  | "study_guide"
  | "resource"
  | "mock_exam"
  | "body_map"
  | "matching"
  | "rest";

export interface PlanItem {
  kind: PlanItemKind;
  title: string;
  description?: string;
  estMinutes: number;
  domainId?: number;
  topicId?: number;
  notebookId?: number;
  link?: string;
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

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

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
): ScheduleDay[] {
  const days = eachDay(startDate, examDate);
  const today = todayStr();
  const totalDays = days.length;

  // Weighted ordering of domains for the rotation by exam weight (heaviest first)
  const orderedDomains = [...domains].sort((a, b) => b.weight - a.weight);

  // Phase boundaries
  const lastIdx = totalDays - 1;
  const finalReviewStart = Math.max(0, lastIdx - 2); // last 3 days = final review
  const integrationStart = Math.max(0, Math.floor(totalDays * 0.7));
  const deepStudyStart = Math.max(0, Math.floor(totalDays * 0.25));

  return days.map((date, i) => {
    const daysToExam = lastIdx - i;
    const isExamDay = i === lastIdx;
    const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0 Sun

    let phase: ScheduleDay["phase"];
    if (isExamDay) phase = "mock_exam";
    else if (i >= finalReviewStart) phase = "final_review";
    else if (i >= integrationStart) phase = "integration";
    else if (i >= deepStudyStart) phase = "deep_study";
    else phase = "foundation";

    const focusDomain = orderedDomains[i % orderedDomains.length];
    const content = contentFor(focusDomain?.name);
    const region = pick(content.regions, i);
    const gameId = pick(content.gameIds, i);

    const items: PlanItem[] = [];
    let title = "";

    if (isExamDay) {
      title = "Exam Day — light review only";
      items.push(
        { kind: "review", title: "Light morning review of formula sheets and red-flag lists", estMinutes: 20 },
        { kind: "rest", title: "Hydrate, eat well, arrive 30 min early", estMinutes: 0 },
      );
    } else if (phase === "final_review") {
      title = `Final Review — ${focusDomain?.name ?? "all domains"}`;
      items.push(
        { kind: "flashcards", title: "Sweep ALL due flashcards", estMinutes: 30, link: "/flashcards" },
        {
          kind: "quiz",
          title: "60-question mixed adaptive quiz",
          description: "Heavily weighted toward your weakest topics across all 5 domains.",
          estMinutes: 60,
          link: "/quiz",
        },
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
    } else if (phase === "integration") {
      // Weekly mock-exam day on Saturdays during integration
      if (dow === 6) {
        title = "Full-length Mock Exam";
        items.push(
          {
            kind: "mock_exam",
            title: "Take a 175-question, 4-hour mock exam",
            description: "Strict timing, no back-nav. Mirror real test conditions.",
            estMinutes: 240,
            link: "/mock-exam",
          },
          {
            kind: "review",
            title: "Review every missed question with the AI tutor",
            estMinutes: 60,
            link: "/tutor",
          },
        );
      } else {
        title = `Integration — ${focusDomain?.name}`;
        items.push(
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
      }
    } else if (phase === "deep_study") {
      title = `Deep Study — ${focusDomain?.name}`;
      items.push(
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

    // Rest day on Sundays during foundation/deep_study (but not in final review)
    if (!isExamDay && dow === 0 && phase !== "final_review" && phase !== "integration") {
      title = "Light Rest Day";
      items.length = 0;
      items.push(
        { kind: "flashcards", title: "Quick 10-minute flashcard sweep", estMinutes: 10, link: "/flashcards" },
        { kind: "matching", title: "One matching game of your choice", estMinutes: 8, link: "/games" },
        { kind: "rest", title: "Recover. Hydrate. Walk. Sleep early.", estMinutes: 0 },
      );
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
