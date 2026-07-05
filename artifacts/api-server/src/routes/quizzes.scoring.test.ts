import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  domains,
  questions,
  quizAnswers,
  quizzes,
  taskMastery,
  tasks,
  topicMastery,
  topics,
} from "@workspace/db";
import app from "../app";

// A fixed anonymous session id (satisfies the boc_sid cookie regex) so all
// mastery/quiz rows are deterministically scoped to this run and easy to purge.
const TEST_SESSION = `test-scoring-${Date.now()}-${Math.random()
  .toString(36)
  .slice(2)}`;

let server: Server;
let baseUrl: string;

// Seeded fixtures we own and must remove on teardown.
let domainId: number;
let taskId: number;
let topicId: number;
// Single-select questions (correctIndex 0) tagged to topicId + taskId.
let singleCorrectQid: number;
let singleWrongQid: number;
// Multi-select questions with correctIndices [0, 1], tagged to topicId only.
let multiQid: number;
let multiQid2: number;
const seededQuestionIds: number[] = [];
const createdQuizIds: number[] = [];

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

// Insert a quiz owned by TEST_SESSION over the given question ids, bypassing
// POST /quizzes so the exact question set (and its item types) is deterministic.
async function makeQuiz(questionIds: number[]): Promise<number> {
  const [quiz] = await db
    .insert(quizzes)
    .values({ userId: TEST_SESSION, mode: "adaptive", questionIds })
    .returning({ id: quizzes.id });
  createdQuizIds.push(quiz.id);
  return quiz.id;
}

async function seed(): Promise<void> {
  const [d] = await db
    .insert(domains)
    .values({ code: `SCT-${Date.now()}`, name: "Scoring Test Domain", weight: 0 })
    .returning({ id: domains.id });
  domainId = d.id;

  const [t] = await db
    .insert(tasks)
    .values({
      code: `SCT-${Date.now()}`,
      domainId,
      statement: "Scoring test task statement",
    })
    .returning({ id: tasks.id });
  taskId = t.id;

  const [tp] = await db
    .insert(topics)
    .values({ domainId, name: "Scoring Test Topic" })
    .returning({ id: topics.id });
  topicId = tp.id;

  const qRows = await db
    .insert(questions)
    .values([
      {
        stem: "single correct",
        choices: ["a", "b", "c", "d"],
        correctIndex: 0,
        rationale: "r",
        domainId,
        topicId,
        taskId,
        sourceKind: "test",
        enabled: true,
      },
      {
        stem: "single wrong",
        choices: ["a", "b", "c", "d"],
        correctIndex: 0,
        rationale: "r",
        domainId,
        topicId,
        taskId,
        sourceKind: "test",
        enabled: true,
      },
      {
        stem: "multi select",
        choices: ["a", "b", "c", "d"],
        correctIndex: 0,
        multiSelect: true,
        correctIndices: [0, 1],
        itemType: "multi",
        rationale: "r",
        domainId,
        topicId,
        sourceKind: "test",
        enabled: true,
      },
      {
        stem: "multi select 2",
        choices: ["a", "b", "c", "d"],
        correctIndex: 0,
        multiSelect: true,
        correctIndices: [0, 1],
        itemType: "multi",
        rationale: "r",
        domainId,
        topicId,
        sourceKind: "test",
        enabled: true,
      },
    ])
    .returning({ id: questions.id });
  [singleCorrectQid, singleWrongQid, multiQid, multiQid2] = qRows.map((q) => q.id);
  seededQuestionIds.push(...qRows.map((q) => q.id));
}

async function cleanup(): Promise<void> {
  if (createdQuizIds.length > 0) {
    await db.delete(quizAnswers).where(inArray(quizAnswers.quizId, createdQuizIds));
    await db.delete(quizzes).where(inArray(quizzes.id, createdQuizIds));
  }
  if (topicId != null) {
    await db.delete(topicMastery).where(eq(topicMastery.topicId, topicId));
  }
  if (taskId != null) {
    await db.delete(taskMastery).where(eq(taskMastery.taskId, taskId));
  }
  if (seededQuestionIds.length > 0) {
    await db.delete(questions).where(inArray(questions.id, seededQuestionIds));
  }
  if (topicId != null) await db.delete(topics).where(eq(topics.id, topicId));
  if (taskId != null) await db.delete(tasks).where(eq(tasks.id, taskId));
  if (domainId != null) await db.delete(domains).where(eq(domains.id, domainId));
}

describe("quiz scoring & mastery", () => {
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

  it("answering a single-select question rolls up into topic_mastery and task_mastery", async () => {
    const quizId = await makeQuiz([singleCorrectQid, singleWrongQid]);

    // First answer is CORRECT (correctIndex is 0).
    const a1 = await api(`/quizzes/${quizId}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: singleCorrectQid, selectedIndex: 0 }),
    });
    assert.equal(a1.status, 200);
    assert.equal(a1.body.correct, true, "picking index 0 is correct");

    // After a single correct answer both mastery tables read 1/1 = 1.0.
    const [tm1] = await db
      .select()
      .from(topicMastery)
      .where(and(eq(topicMastery.userId, TEST_SESSION), eq(topicMastery.topicId, topicId)));
    assert.ok(tm1, "topic_mastery row created on first answer");
    assert.equal(tm1.attempts, 1, "one attempt recorded");
    assert.equal(tm1.correct, 1, "one correct recorded");
    assert.equal(tm1.mastery, 1, "mastery = correct/attempts = 1");

    const [km1] = await db
      .select()
      .from(taskMastery)
      .where(and(eq(taskMastery.userId, TEST_SESSION), eq(taskMastery.taskId, taskId)));
    assert.ok(km1, "task_mastery row created because the question carries a taskId");
    assert.equal(km1.attempts, 1);
    assert.equal(km1.correct, 1);
    assert.equal(km1.mastery, 1);

    // Second answer is WRONG — both tables must increment attempts, hold correct,
    // and recompute mastery to 1/2 = 0.5.
    const a2 = await api(`/quizzes/${quizId}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: singleWrongQid, selectedIndex: 1 }),
    });
    assert.equal(a2.status, 200);
    assert.equal(a2.body.correct, false, "picking index 1 is wrong");

    const [tm2] = await db
      .select()
      .from(topicMastery)
      .where(and(eq(topicMastery.userId, TEST_SESSION), eq(topicMastery.topicId, topicId)));
    assert.equal(tm2.attempts, 2, "attempts incremented");
    assert.equal(tm2.correct, 1, "correct unchanged by a wrong answer");
    assert.equal(tm2.mastery, 0.5, "mastery recomputed to 1/2");

    const [km2] = await db
      .select()
      .from(taskMastery)
      .where(and(eq(taskMastery.userId, TEST_SESSION), eq(taskMastery.taskId, taskId)));
    assert.equal(km2.attempts, 2);
    assert.equal(km2.correct, 1);
    assert.equal(km2.mastery, 0.5);
  });

  it("a multi-select answer is correct only on an exact match and earns non-negative partial credit", async () => {
    // A partial selection ([0] of [0,1]) is NOT counted correct...
    const partialQuiz = await makeQuiz([multiQid]);
    const partial = await api(`/quizzes/${partialQuiz}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: multiQid, selectedIndices: [0] }),
    });
    assert.equal(partial.status, 200);
    assert.equal(partial.body.correct, false, "a partial selection is not fully correct");
    // ...but it earns fractional credit at finish: 1 of 2 correct picks = 50%.
    const partialFinish = await api(`/quizzes/${partialQuiz}/finish`, { method: "POST" });
    assert.equal(partialFinish.body.score, 50, "partial multi-select earns 50% credit");

    // A selection with more wrong than right picks is clamped to 0, never below.
    const negQuiz = await makeQuiz([multiQid]);
    const neg = await api(`/quizzes/${negQuiz}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: multiQid, selectedIndices: [2, 3] }),
    });
    assert.equal(neg.body.correct, false, "all-wrong selection is not correct");
    const negFinish = await api(`/quizzes/${negQuiz}/finish`, { method: "POST" });
    assert.equal(negFinish.body.score, 0, "credit never goes negative — clamped to 0");

    // An exact match ([0,1]) is counted correct and earns full credit.
    const exactQuiz = await makeQuiz([multiQid]);
    const exact = await api(`/quizzes/${exactQuiz}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: multiQid, selectedIndices: [1, 0] }),
    });
    assert.equal(exact.body.correct, true, "the exact set (order-insensitive) is correct");
    const exactFinish = await api(`/quizzes/${exactQuiz}/finish`, { method: "POST" });
    assert.equal(exactFinish.body.score, 100, "an exact multi-select match earns 100%");
  });

  it("finish scores a mixed single/multi-select quiz with partial credit", async () => {
    // A quiz mixing a correct single-select (credit 1.0) with a partially
    // answered multi-select (credit 0.5): overall = (1 + 0.5) / 2 = 75%.
    const quizId = await makeQuiz([singleCorrectQid, multiQid]);
    await api(`/quizzes/${quizId}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: singleCorrectQid, selectedIndex: 0 }),
    });
    await api(`/quizzes/${quizId}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: multiQid, selectedIndices: [0] }),
    });
    const finish = await api(`/quizzes/${quizId}/finish`, { method: "POST" });
    assert.equal(finish.status, 200);
    assert.equal(finish.body.total, 2, "both answers are scored");
    assert.equal(
      finish.body.score,
      75,
      "partial credit blends single (1.0) and multi (0.5) into 75%",
    );

    // Adding a second, fully-correct multi-select lifts the average:
    // (1 + 0.5 + 1) / 3 = 83.33%.
    const quiz2 = await makeQuiz([singleCorrectQid, multiQid, multiQid2]);
    await api(`/quizzes/${quiz2}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: singleCorrectQid, selectedIndex: 0 }),
    });
    await api(`/quizzes/${quiz2}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: multiQid, selectedIndices: [0] }),
    });
    await api(`/quizzes/${quiz2}/answer`, {
      method: "POST",
      body: JSON.stringify({ questionId: multiQid2, selectedIndices: [0, 1] }),
    });
    const finish2 = await api(`/quizzes/${quiz2}/finish`, { method: "POST" });
    assert.equal(finish2.body.total, 3);
    assert.ok(
      Math.abs(finish2.body.score - (100 * 2.5) / 3) < 1e-9,
      `mixed partial credit averages to 83.33%, got ${finish2.body.score}`,
    );
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
