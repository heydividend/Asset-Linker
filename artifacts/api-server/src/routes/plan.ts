import { Router, type IRouter } from "express";
import { desc, lte, sql } from "drizzle-orm";
import {
  db,
  flashcards,
  topicMastery,
  topics,
  notebooks,
  domains,
  examSchedule,
} from "@workspace/db";
import {
  buildSchedule,
  todayStr,
  type PlanItem,
  type ScheduleDay,
} from "../lib/scheduleBuilder";
import { isMandatoryKind, planItemKey } from "../lib/planItemKey";
import { getDomainMasteryMap } from "../lib/domainMastery";
import { getOrCreateSessionId } from "../lib/sessionId";
import { listCompletedKeys, listCompletedKeysThrough } from "../lib/planCompletions";
import { getOrCreateSchedule } from "../lib/planSchedule";

const router: IRouter = Router();

// Hard cap on how many items the Today list surfaces. buildTodayItems
// assembles today's native items first and appends carry-overs after, so this
// cap can only ever trim trailing carry-overs — never today's own work.
export const TODAY_ITEM_CAP = 16;

// Adds key + mandatory to every plan item, deduping repeats by key so a day
// only ever has one canonical representative for a given activity.
export function decorateItems(items: PlanItem[]) {
  const seen = new Set<string>();
  const out: (PlanItem & { key: string; mandatory: boolean })[] = [];
  for (const it of items) {
    const key = planItemKey(it);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...it, key, mandatory: isMandatoryKind(it.kind) });
  }
  return out;
}

// Finalize the assembled Today list: dedupe by key (the first/most-canonical
// occurrence wins) and cap the length. Because buildTodayItems pushes today's
// native items before any carry-overs, this (a) collapses a carry-over that
// shares a key with a native item into the native entry, and (b) guarantees the
// cap drops trailing carry-overs rather than today's mandatory work.
export function finalizeTodayList(items: PlanItem[]) {
  return decorateItems(items).slice(0, TODAY_ITEM_CAP);
}

router.get("/plan/schedule", async (_req, res): Promise<void> => {
  const sched = await getOrCreateSchedule();
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap();
  const days = buildSchedule(sched.startDate, sched.examDate, dRows, masteryByDomainId).map((d) => ({
    ...d,
    items: decorateItems(d.items),
  }));
  const today = todayStr();
  const todayIdx = days.findIndex((d) => d.date === today);
  res.json({
    startDate: sched.startDate,
    examDate: sched.examDate,
    examName: sched.examName,
    totalDays: days.length,
    daysCompleted: Math.max(0, todayIdx),
    daysRemaining: Math.max(0, days.length - todayIdx - 1),
    today,
    days,
  });
});

router.put("/plan/schedule", async (req, res): Promise<void> => {
  const { startDate, examDate, examName } = req.body ?? {};
  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRe.test(startDate) || !dateRe.test(examDate)) {
    res.status(400).json({ error: "startDate and examDate must be YYYY-MM-DD" });
    return;
  }
  const existing = await db.select().from(examSchedule).limit(1);
  let row;
  if (existing[0]) {
    [row] = await db
      .update(examSchedule)
      .set({
        startDate,
        examDate,
        ...(examName ? { examName } : {}),
        updatedAt: new Date(),
      })
      .returning();
  } else {
    [row] = await db
      .insert(examSchedule)
      .values({ startDate, examDate, ...(examName ? { examName } : {}) })
      .returning();
  }
  res.json(row);
});

// ----- Roll-over: any item scheduled on a prior day that the user has never
// ticked off (on its original date OR any later day) gets surfaced today,
// tagged with its original date. We dedupe by item key so the same activity
// scheduled on multiple past days only shows up once (earliest occurrence
// wins), and skip pure rest items — those expire with the day. Extracted from
// buildTodayItems so the carry-forward contract can be exercised with a
// controlled `today` in tests.
export async function computeCarriedForwardItems(
  sessionId: string,
  days: ScheduleDay[],
  today: string,
): Promise<PlanItem[]> {
  const everCompleted = new Set(await listCompletedKeysThrough(sessionId, today));
  const carriedByKey = new Map<string, PlanItem>();
  const pastDays = days.filter((d) => d.date < today);
  for (const day of pastDays) {
    for (const it of day.items) {
      if (it.kind === "rest") continue;
      const key = planItemKey(it);
      if (everCompleted.has(key)) continue;
      if (carriedByKey.has(key)) continue; // earliest occurrence wins
      carriedByKey.set(key, { ...it, carriedFrom: day.date });
    }
  }
  return Array.from(carriedByKey.values());
}

export async function buildTodayItems(sessionId: string) {
  const items: PlanItem[] = [];
  const sched = await getOrCreateSchedule();
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const masteryByDomainId = await getDomainMasteryMap();
  const days = buildSchedule(sched.startDate, sched.examDate, dRows, masteryByDomainId);
  const today = todayStr();
  const todayDay = days.find((d) => d.date === today);

  const carried = await computeCarriedForwardItems(sessionId, days, today);

  // Today's native items first; carried items are appended after, but
  // decorateItems will dedupe so a carry-over for the same activity already
  // present today is dropped (today's native one is the canonical entry).
  if (todayDay) {
    items.push(...todayDay.items);
  }
  for (const it of carried) items.push(it);

  const [{ due }] = await db
    .select({ due: sql<number>`cast(count(*) as int)` })
    .from(flashcards)
    .where(lte(flashcards.dueAt, new Date()));
  if (due > 0 && !items.some((i) => i.kind === "flashcards")) {
    items.unshift({
      kind: "flashcards",
      title: `Review ${due} due flashcards`,
      description: "Spaced-repetition session covering everything due today.",
      estMinutes: Math.min(40, Math.ceil(due * 0.5) + 5),
      link: "/flashcards",
    });
  }

  const weak = await db.select().from(topicMastery).orderBy(topicMastery.mastery).limit(2);
  const tRows = await db.select().from(topics);
  for (const w of weak) {
    if (w.attempts < 2) continue;
    const t = tRows.find((x) => x.id === w.topicId);
    if (!t) continue;
    items.push({
      kind: "quiz",
      title: `Targeted quiz: ${t.name}`,
      description: `Mastery ${(w.mastery * 100).toFixed(0)}% — strengthen this weak topic.`,
      estMinutes: 12,
      topicId: t.id,
      link: "/quiz",
    });
  }

  const recentNotebooks = await db.select().from(notebooks).orderBy(desc(notebooks.updatedAt)).limit(1);
  if (recentNotebooks[0] && !items.some((i) => i.kind === "study_guide")) {
    items.push({
      kind: "study_guide",
      title: `Study: ${recentNotebooks[0].title}`,
      description: "Generate or revisit a study guide for your most recent notebook.",
      estMinutes: 25,
      notebookId: recentNotebooks[0].id,
      link: `/notebooks/${recentNotebooks[0].id}`,
    });
  }

  // Allow more items in the daily list to make room for carry-overs without
  // squeezing out today's mandatory work.
  const decorated = finalizeTodayList(items);
  const completedKeys = new Set(await listCompletedKeys(sessionId, today));
  const itemsOut = decorated.map((it) => ({
    ...it,
    completed: completedKeys.has(it.key),
  }));
  const mandatory = itemsOut.filter((it) => it.mandatory);
  const completedCount = itemsOut.filter((it) => it.completed).length;
  const completedMandatory = mandatory.filter((it) => it.completed).length;
  return {
    date: today,
    daysToExam: todayDay?.daysToExam,
    phase: todayDay?.phase,
    title: todayDay?.title,
    items: itemsOut,
    mandatoryCount: mandatory.length,
    completedMandatoryCount: completedMandatory,
    completedCount,
    dayComplete: mandatory.length > 0 && completedMandatory === mandatory.length,
  };
}

router.get("/plan/today", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  res.json(await buildTodayItems(sessionId));
});

router.post("/plan/regenerate", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  res.json(await buildTodayItems(sessionId));
});

export default router;
