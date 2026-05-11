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
import { buildSchedule, todayStr } from "../lib/scheduleBuilder";

const router: IRouter = Router();

const DEFAULT_START = "2026-05-11";
const DEFAULT_EXAM = "2026-06-06";

async function getOrCreateSchedule() {
  const [row] = await db.select().from(examSchedule).limit(1);
  if (row) return row;
  const [created] = await db
    .insert(examSchedule)
    .values({ startDate: DEFAULT_START, examDate: DEFAULT_EXAM })
    .returning();
  return created;
}

router.get("/plan/schedule", async (_req, res): Promise<void> => {
  const sched = await getOrCreateSchedule();
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const days = buildSchedule(sched.startDate, sched.examDate, dRows);
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

async function buildTodayItems() {
  const items: any[] = [];
  const sched = await getOrCreateSchedule();
  const dRows = await db.select().from(domains).orderBy(domains.id);
  const days = buildSchedule(sched.startDate, sched.examDate, dRows);
  const today = todayStr();
  const todayDay = days.find((d) => d.date === today);
  if (todayDay) {
    items.push(...todayDay.items);
  }

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

  return {
    date: today,
    daysToExam: todayDay?.daysToExam,
    phase: todayDay?.phase,
    title: todayDay?.title,
    items: items.slice(0, 8),
  };
}

router.get("/plan/today", async (_req, res): Promise<void> => {
  res.json(await buildTodayItems());
});

router.post("/plan/regenerate", async (_req, res): Promise<void> => {
  res.json(await buildTodayItems());
});

export default router;
