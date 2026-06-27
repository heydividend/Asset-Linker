import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { eq, inArray } from "drizzle-orm";
import {
  db,
  dailyQuizSets,
  domains,
  planCompletions,
  questions,
  quizAnswers,
  quizzes,
  topicMastery,
  topics,
} from "@workspace/db";
import app from "../app";
import { todayStr } from "../lib/planCompletions";

// A fixed anonymous session id (must satisfy the cookie regex in sessionId.ts:
// ^[A-Za-z0-9_-]{16,}$) so plan-completion rows are deterministically scoped
// to this test run and trivially cleaned up.
const TEST_SESSION = `test-daily-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2)}`;

let server: Server;
let baseUrl: string;

// Seeded fixtures we own and must remove on teardown.
let domainId: number;
let topicIds: number[] = [];
let seededQuestionIds: number[] = [];
const createdQuizIds: number[] = [];

// The pre-existing daily set for today (if any). We replace it with our own
// deterministic set for the duration of the test and restore it afterward so
// we never clobber real data.
let savedDailyQuestionIds: number[] | null = null;

async function api(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: any }> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      cookie: `boc_sid=${TEST_SESSION}`,
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function seed(): Promise<void> {
  const [d] = await db
    .insert(domains)
    .values({
      code: `TST-${Date.now()}`,
      name: "Daily Quiz Test Domain",
      weight: 0,
    })
    .returning({ id: domains.id });
  domainId = d.id;

  const tRows = await db
    .insert(topics)
    .values([
      { domainId, name: "Daily Test Topic A" },
      { domainId, name: "Daily Test Topic B" },
    ])
    .returning({ id: topics.id });
  topicIds = tRows.map((t) => t.id);

  const qRows = await db
    .insert(questions)
    .values(
      Array.from({ length: 6 }, (_, i) => ({
        stem: `Daily test question ${i}`,
        choices: ["a", "b", "c", "d"],
        correctIndex: 0,
        rationale: "test rationale",
        domainId,
        topicId: topicIds[i % topicIds.length],
        sourceKind: "daily",
        enabled: true,
      })),
    )
    .returning({ id: questions.id });
  seededQuestionIds = qRows.map((q) => q.id);

  // Replace today's cached daily set with our deterministic one so the daily
  // endpoint resolves to questions we control (no AI generation in tests).
  const today = todayStr();
  const [existing] = await db
    .select()
    .from(dailyQuizSets)
    .where(eq(dailyQuizSets.date, today));
  savedDailyQuestionIds = existing ? existing.questionIds : null;
  await db.delete(dailyQuizSets).where(eq(dailyQuizSets.date, today));
  await db
    .insert(dailyQuizSets)
    .values({ date: today, questionIds: seededQuestionIds });
}

async function cleanup(): Promise<void> {
  const today = todayStr();
  await db
    .delete(planCompletions)
    .where(eq(planCompletions.sessionId, TEST_SESSION));

  if (createdQuizIds.length > 0) {
    await db
      .delete(quizAnswers)
      .where(inArray(quizAnswers.quizId, createdQuizIds));
    await db.delete(quizzes).where(inArray(quizzes.id, createdQuizIds));
  }

  // Remove our seeded fixtures first so they can never leak even if a later
  // step throws. (Nothing has a hard FK onto these rows.)
  if (seededQuestionIds.length > 0) {
    await db
      .delete(questions)
      .where(inArray(questions.id, seededQuestionIds));
  }
  if (topicIds.length > 0) {
    await db
      .delete(topicMastery)
      .where(inArray(topicMastery.topicId, topicIds));
    await db.delete(topics).where(inArray(topics.id, topicIds));
  }
  if (domainId != null) {
    await db.delete(domains).where(eq(domains.id, domainId));
  }

  // Restore the original daily set for today.
  await db.delete(dailyQuizSets).where(eq(dailyQuizSets.date, today));
  if (savedDailyQuestionIds) {
    await db
      .insert(dailyQuizSets)
      .values({ date: today, questionIds: savedDailyQuestionIds })
      .onConflictDoNothing({ target: dailyQuizSets.date });
  }
}

describe("daily quiz endpoint", () => {
  before(async () => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
    await seed();
    server = app.listen(0);
    await once(server, "listening");
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}/api`;
  });

  after(async () => {
    if (server) {
      server.close();
      await once(server, "close");
    }
    await cleanup();
  });

  it("returns the same per-day set on repeated POSTs and every question carries a topicId in its domain", async () => {
    const first = await api("/quizzes/daily", { method: "POST" });
    assert.ok(
      first.status === 200 || first.status === 201,
      `first POST should succeed, got ${first.status}`,
    );
    createdQuizIds.push(first.body.id);

    const firstIds = first.body.questions.map((q: any) => q.questionId);
    assert.deepEqual(
      firstIds,
      seededQuestionIds,
      "today's quiz should be exactly the cached daily set, in order",
    );

    // Every daily question must carry a topicId, and that topic must belong to
    // the question's own domain — this is what makes daily answers roll up into
    // per-domain mastery.
    for (const q of first.body.questions) {
      assert.ok(
        q.topicId != null,
        `question ${q.questionId} must carry a topicId`,
      );
      assert.ok(
        topicIds.includes(q.topicId),
        `question ${q.questionId} topicId ${q.topicId} should be one of the domain's topics`,
      );
      assert.equal(
        q.domainId,
        domainId,
        `question ${q.questionId} should belong to the seeded domain`,
      );
    }

    const second = await api("/quizzes/daily", { method: "POST" });
    assert.equal(
      second.status,
      200,
      "second POST in the same day should resume, not create a new attempt",
    );
    createdQuizIds.push(second.body.id);

    assert.equal(
      second.body.id,
      first.body.id,
      "the second POST should resume the same daily attempt",
    );
    const secondIds = second.body.questions.map((q: any) => q.questionId);
    assert.deepEqual(
      secondIds,
      firstIds,
      "the resumed attempt must contain the identical question set",
    );
  });

  it("clones a finished daily set into a fresh, independently-scored practice attempt", async () => {
    // Finish a daily attempt so it has a score and answers.
    const created = await api("/quizzes/daily", { method: "POST" });
    assert.ok(created.status === 200 || created.status === 201);
    const dailyId = created.body.id;
    createdQuizIds.push(dailyId);
    const dailyQids = created.body.questions.map((q: any) => q.questionId);
    await api(`/quizzes/${dailyId}/finish`, { method: "POST" });

    const practice = await api(`/quizzes/${dailyId}/practice`, { method: "POST" });
    assert.equal(practice.status, 201, "practice should create a new attempt");
    const practiceId = practice.body.id;
    createdQuizIds.push(practiceId);

    assert.notEqual(practiceId, dailyId, "practice must be a brand-new attempt");
    assert.equal(practice.body.mode, "practice", "cloned attempt is a practice run");
    assert.equal(practice.body.finished, false, "practice starts unfinished");
    assert.equal(practice.body.currentIndex, 0, "practice starts at the beginning");
    const practiceQids = practice.body.questions.map((q: any) => q.questionId);
    assert.deepEqual(
      practiceQids,
      dailyQids,
      "practice reuses the exact same question set in order",
    );
    // No answers carried over: review fields are only present once answered.
    for (const q of practice.body.questions) {
      assert.equal(q.selectedIndex, undefined, "practice questions start unanswered");
    }

    // The practice attempt shows up in recent attempts but NOT in daily history.
    const attempts = await api("/quizzes?limit=50", { method: "GET" });
    assert.ok(
      attempts.body.some((a: any) => a.id === practiceId),
      "practice attempt should appear in recent attempts",
    );
    const history = await api("/quizzes/daily/history", { method: "GET" });
    assert.ok(
      !history.body.some((h: any) => h.id === practiceId),
      "practice attempt must not pollute the daily history list",
    );
  });

  it("returns 404 when practicing a non-existent quiz", async () => {
    const res = await api("/quizzes/99999999/practice", { method: "POST" });
    assert.equal(res.status, 404);
  });

  it("marks quiz:daily complete when a daily attempt is finished", async () => {
    const created = await api("/quizzes/daily", { method: "POST" });
    assert.ok(created.status === 200 || created.status === 201);
    const quizId = created.body.id;
    createdQuizIds.push(quizId);

    const finished = await api(`/quizzes/${quizId}/finish`, {
      method: "POST",
    });
    assert.equal(finished.status, 200, "finishing the quiz should succeed");

    const completed = await db
      .select({ itemKey: planCompletions.itemKey })
      .from(planCompletions)
      .where(eq(planCompletions.sessionId, TEST_SESSION));
    const keys = completed.map((r) => r.itemKey);
    assert.ok(
      keys.includes("quiz:daily"),
      `finishing a daily attempt should record quiz:daily (got ${JSON.stringify(keys)})`,
    );
    assert.ok(
      keys.includes("quiz:any"),
      "finishing any quiz should also record the generic quiz:any key",
    );
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
