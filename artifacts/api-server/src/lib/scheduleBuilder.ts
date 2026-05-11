import type { Domain } from "@workspace/db";

export type PlanItemKind =
  | "quiz"
  | "flashcards"
  | "review"
  | "audio"
  | "study_guide"
  | "resource"
  | "mock_exam"
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

    const items: PlanItem[] = [];
    let title = "";

    if (isExamDay) {
      title = "Exam Day — light review only";
      items.push(
        { kind: "review", title: "Light morning review of formula sheets", estMinutes: 20 },
        { kind: "rest", title: "Hydrate, eat well, arrive 30 min early", estMinutes: 0 },
      );
    } else if (phase === "final_review") {
      title = `Final Review — ${focusDomain?.name ?? "all domains"}`;
      items.push(
        { kind: "flashcards", title: "Review all due flashcards", estMinutes: 30, link: "/flashcards" },
        {
          kind: "quiz",
          title: "60-question mixed adaptive quiz",
          description: "Heavily weighted toward your weakest topics.",
          estMinutes: 60,
          link: "/quiz",
        },
        {
          kind: "review",
          title: `Re-read ${focusDomain?.name ?? "weak"} study guides`,
          estMinutes: 25,
          domainId: focusDomain?.id,
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
            description: "Generate or listen to an existing audio overview.",
            estMinutes: 15,
          },
          {
            kind: "review",
            title: "Practice case scenarios",
            estMinutes: 30,
            domainId: focusDomain?.id,
          },
        );
      }
    } else if (phase === "deep_study") {
      title = `Deep Study — ${focusDomain?.name}`;
      items.push(
        {
          kind: "study_guide",
          title: `Generate study guide for ${focusDomain?.name}`,
          description: "Use the notebook for this domain to generate or revisit a guide.",
          estMinutes: 45,
          domainId: focusDomain?.id,
        },
        {
          kind: "flashcards",
          title: "Review due cards + add 10 new",
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
    } else {
      // foundation
      title = `Foundation — ${focusDomain?.name}`;
      items.push(
        {
          kind: "study_guide",
          title: `Read overview of ${focusDomain?.name}`,
          estMinutes: 35,
          domainId: focusDomain?.id,
        },
        {
          kind: "flashcards",
          title: "Build initial flashcard set",
          description: "Generate flashcards from your notes.",
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
    }

    // Rest day on Sundays during foundation/deep_study (but not in final review)
    if (!isExamDay && dow === 0 && phase !== "final_review" && phase !== "integration") {
      title = "Light Rest Day";
      items.length = 0;
      items.push(
        { kind: "flashcards", title: "Quick 10-minute flashcard sweep", estMinutes: 10, link: "/flashcards" },
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
