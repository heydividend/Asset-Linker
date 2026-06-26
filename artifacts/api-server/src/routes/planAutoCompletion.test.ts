import { after, afterEach, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { and, eq } from "drizzle-orm";
import { db, planCompletions } from "@workspace/db";
import { listCompletedKeys, markPlanItemComplete } from "../lib/planCompletions";
import { linkQuizFinishToPlan } from "./quizzes";
import { linkFlashcardReviewToPlan } from "./flashcards";
import { linkStudyGuideOpenToPlan } from "./studyGuides";
import { linkGameSessionToPlan } from "./gameSessions";
import { linkStudyGroupRoundToPlan } from "./studyGroup";

// Use a session id unique to this test run so the rows we create can never
// collide with real user data and are trivially cleaned up by session id. A
// fixed, far-future date keeps the assertions independent of the live schedule:
// planCompletions has no FK on itemKey/date, so we can record any key on any day.
const TEST_SESSION = `test-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const DATE = "2099-01-01";

async function cleanup(): Promise<void> {
  await db
    .delete(planCompletions)
    .where(eq(planCompletions.sessionId, TEST_SESSION));
}

// How many rows exist for a single (session, date, key) — used to prove that
// finishing an activity twice never double-counts.
async function countKey(key: string): Promise<number> {
  const rows = await db
    .select({ id: planCompletions.id })
    .from(planCompletions)
    .where(
      and(
        eq(planCompletions.sessionId, TEST_SESSION),
        eq(planCompletions.date, DATE),
        eq(planCompletions.itemKey, key),
      ),
    );
  return rows.length;
}

describe("activity plan auto-completion", () => {
  before(() => {
    if (!process.env["DATABASE_URL"]) {
      throw new Error("DATABASE_URL must be set to run these tests");
    }
  });

  afterEach(async () => {
    await cleanup();
  });

  after(async () => {
    await cleanup();
  });

  describe("quiz", () => {
    it("records topic, domain and 'any' keys for a fully-targeted quiz", async () => {
      const keys = await linkQuizFinishToPlan(TEST_SESSION, DATE, {
        topicId: 7,
        domainId: 3,
      });
      assert.deepEqual(keys, ["quiz:topic:7", "quiz:domain:3", "quiz:any"]);

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(
        completed.sort(),
        ["quiz:any", "quiz:domain:3", "quiz:topic:7"],
        "a targeted quiz should check the topic, domain and generic plan rows",
      );
    });

    it("records only 'quiz:any' for an untargeted quiz", async () => {
      const keys = await linkQuizFinishToPlan(TEST_SESSION, DATE, {
        topicId: null,
        domainId: null,
      });
      assert.deepEqual(keys, ["quiz:any"]);

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(completed, ["quiz:any"]);
    });

    it("is idempotent — finishing twice plus a manual mark does not double-count", async () => {
      await linkQuizFinishToPlan(TEST_SESSION, DATE, { topicId: 7, domainId: 3 });
      // A retried finish request hits the same (session, date, keys).
      await linkQuizFinishToPlan(TEST_SESSION, DATE, { topicId: 7, domainId: 3 });
      // A later manual "mark complete" tap on the targeted row is a no-op insert.
      const insertedAgain = await markPlanItemComplete(
        TEST_SESSION,
        DATE,
        "quiz:topic:7",
      );
      assert.equal(insertedAgain, false);

      assert.equal(await countKey("quiz:topic:7"), 1);
      assert.equal(await countKey("quiz:domain:3"), 1);
      assert.equal(await countKey("quiz:any"), 1);
    });
  });

  describe("flashcards", () => {
    it("records the flashcards:due key when a card is reviewed", async () => {
      const key = await linkFlashcardReviewToPlan(TEST_SESSION, DATE);
      assert.equal(key, "flashcards:due");

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(completed, ["flashcards:due"]);
    });

    it("is idempotent — reviewing many cards plus a manual mark does not double-count", async () => {
      await linkFlashcardReviewToPlan(TEST_SESSION, DATE);
      await linkFlashcardReviewToPlan(TEST_SESSION, DATE);
      const insertedAgain = await markPlanItemComplete(
        TEST_SESSION,
        DATE,
        "flashcards:due",
      );
      assert.equal(insertedAgain, false);

      assert.equal(await countKey("flashcards:due"), 1);
    });
  });

  describe("study guide", () => {
    it("records notebook and 'any' keys when a guide is opened", async () => {
      const keys = await linkStudyGuideOpenToPlan(TEST_SESSION, DATE, {
        notebookId: 5,
      });
      assert.deepEqual(keys, ["study_guide:notebook:5", "study_guide:any"]);

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(
        completed.sort(),
        ["study_guide:any", "study_guide:notebook:5"],
      );
    });

    it("records only 'study_guide:any' when there is no notebook", async () => {
      const keys = await linkStudyGuideOpenToPlan(TEST_SESSION, DATE, {
        notebookId: null,
      });
      assert.deepEqual(keys, ["study_guide:any"]);

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(completed, ["study_guide:any"]);
    });

    it("is idempotent — re-opening a guide plus a manual mark does not double-count", async () => {
      await linkStudyGuideOpenToPlan(TEST_SESSION, DATE, { notebookId: 5 });
      await linkStudyGuideOpenToPlan(TEST_SESSION, DATE, { notebookId: 5 });
      const insertedAgain = await markPlanItemComplete(
        TEST_SESSION,
        DATE,
        "study_guide:notebook:5",
      );
      assert.equal(insertedAgain, false);

      assert.equal(await countKey("study_guide:notebook:5"), 1);
      assert.equal(await countKey("study_guide:any"), 1);
    });
  });

  describe("game", () => {
    it("records the game:<gameId> key when a session is recorded", async () => {
      const key = await linkGameSessionToPlan(TEST_SESSION, DATE, "memory-match");
      assert.equal(key, "game:memory-match");

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(completed, ["game:memory-match"]);
    });

    it("is idempotent — replaying a game plus a manual mark does not double-count", async () => {
      await linkGameSessionToPlan(TEST_SESSION, DATE, "memory-match");
      await linkGameSessionToPlan(TEST_SESSION, DATE, "memory-match");
      const insertedAgain = await markPlanItemComplete(
        TEST_SESSION,
        DATE,
        "game:memory-match",
      );
      assert.equal(insertedAgain, false);

      assert.equal(await countKey("game:memory-match"), 1);
    });
  });

  describe("study group", () => {
    it("records 'any' and domain keys when a round completes with a domain", async () => {
      const keys = await linkStudyGroupRoundToPlan(TEST_SESSION, DATE, 2);
      assert.deepEqual(keys, ["study_group:any", "study_group:domain:2"]);

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(
        completed.sort(),
        ["study_group:any", "study_group:domain:2"],
      );
    });

    it("records only 'study_group:any' when the round has no domain", async () => {
      const keys = await linkStudyGroupRoundToPlan(TEST_SESSION, DATE, null);
      assert.deepEqual(keys, ["study_group:any"]);

      const completed = await listCompletedKeys(TEST_SESSION, DATE);
      assert.deepEqual(completed, ["study_group:any"]);
    });

    it("is idempotent — re-running a round plus a manual mark does not double-count", async () => {
      await linkStudyGroupRoundToPlan(TEST_SESSION, DATE, 2);
      await linkStudyGroupRoundToPlan(TEST_SESSION, DATE, 2);
      const insertedAgain = await markPlanItemComplete(
        TEST_SESSION,
        DATE,
        "study_group:domain:2",
      );
      assert.equal(insertedAgain, false);

      assert.equal(await countKey("study_group:any"), 1);
      assert.equal(await countKey("study_group:domain:2"), 1);
    });
  });
});

// Drain the pg pool when the test process is done so node exits cleanly.
after(async () => {
  const { pool } = await import("@workspace/db");
  await pool.end();
});
