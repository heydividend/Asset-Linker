import { clerkClient } from "@clerk/express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { logger } from "./logger";

const ADMIN_EMAIL = "mhuddleston@heydividend.com";
const STUDENT_EMAIL = "jacobhudd13@gmail.com";

type SeedUser = {
  email: string;
  password: string | undefined;
  firstName: string;
  lastName: string;
};

const SEED_USERS: SeedUser[] = [
  {
    email: ADMIN_EMAIL,
    password: process.env["SEED_ADMIN_PW"],
    firstName: "M",
    lastName: "Huddleston",
  },
  {
    email: STUDENT_EMAIL,
    password: process.env["SEED_STUDENT_PW"],
    firstName: "Jacob",
    lastName: "Huddleston",
  },
];

// Tables with a UNIQUE(user_id, <col>) constraint. A legacy owner-less row can
// collide with a row the student already owns, so the colliding legacy row is
// dropped first (the student's own, newer row wins) before re-keying the rest.
const UNIQUE_TABLES: { table: string; conflictCol: string }[] = [
  { table: "topic_mastery", conflictCol: "topic_id" },
  { table: "task_mastery", conflictCol: "task_id" },
  { table: "daily_quiz_sets", conflictCol: "date" },
  { table: "readiness_snapshots", conflictCol: "snapshot_date" },
];

// Tables with no user_id unique constraint — a plain re-key is always safe.
const PLAIN_TABLES: string[] = [
  "quizzes",
  "exam_schedule",
  "mock_exams",
  "conversations",
];

/**
 * True only when running against the LIVE Clerk instance (production). Replit
 * swaps CLERK_SECRET_KEY to an `sk_live_…` key in the deployed app; development
 * always holds an `sk_test_…` key. Gating on this guarantees the bootstrap can
 * never create accounts or re-key data in the development environment.
 */
function isLiveEnvironment(): boolean {
  return (process.env["CLERK_SECRET_KEY"] ?? "").startsWith("sk_live");
}

async function ensureUser(
  u: SeedUser,
): Promise<{ id: string; created: boolean } | null> {
  const existing = await clerkClient.users.getUserList({
    emailAddress: [u.email],
  });
  const found = (existing?.data ?? existing)?.[0];
  if (found) return { id: found.id, created: false };
  if (!u.password) {
    logger.warn(
      { email: u.email },
      "prodBootstrap: account missing and no seed password configured — skipping create",
    );
    return null;
  }
  const created = await clerkClient.users.createUser({
    emailAddress: [u.email],
    password: u.password,
    firstName: u.firstName,
    lastName: u.lastName,
    skipPasswordChecks: true,
  });
  return { id: created.id, created: true };
}

/**
 * Attaches every owner-less row (user_id NULL or "") to the student account.
 * Self-healing and safe to run on every boot: the multi-user build always
 * writes a real user_id, so the only rows this ever matches are leftovers from
 * the original single-user system. Conflict-safe against per-user unique
 * constraints so partial retries can never abort mid-migration.
 */
async function adoptOrphanData(studentId: string): Promise<number> {
  let total = 0;

  for (const { table, conflictCol } of UNIQUE_TABLES) {
    await db.execute(sql`
      DELETE FROM ${sql.identifier(table)} AS o
      WHERE (o.user_id IS NULL OR o.user_id = '')
        AND EXISTS (
          SELECT 1 FROM ${sql.identifier(table)} AS s
          WHERE s.user_id = ${studentId}
            AND s.${sql.identifier(conflictCol)} = o.${sql.identifier(conflictCol)}
        )`);
    const res = await db.execute(sql`
      UPDATE ${sql.identifier(table)} SET user_id = ${studentId}
      WHERE user_id IS NULL OR user_id = ''`);
    total += res.rowCount ?? 0;
  }

  for (const table of PLAIN_TABLES) {
    const res = await db.execute(sql`
      UPDATE ${sql.identifier(table)} SET user_id = ${studentId}
      WHERE user_id IS NULL OR user_id = ''`);
    total += res.rowCount ?? 0;
  }

  return total;
}

/**
 * One-time production setup, run on server start. Idempotent:
 *  1. Ensures the admin + student accounts exist in the live Clerk instance
 *     (accounts can only be created by an admin — public sign-up is disabled).
 *  2. Re-keys the original single-user study data to the student account so it
 *     becomes visible once the student signs in.
 * Never runs outside the live environment and never throws into startup.
 */
export async function runProdBootstrap(): Promise<void> {
  if (!isLiveEnvironment()) {
    return;
  }
  try {
    let studentId: string | null = null;
    for (const u of SEED_USERS) {
      const result = await ensureUser(u);
      if (result?.created) {
        logger.info({ email: u.email }, "prodBootstrap: created account");
      }
      if (u.email === STUDENT_EMAIL && result) {
        studentId = result.id;
      }
    }

    if (!studentId) {
      logger.warn(
        "prodBootstrap: student account unavailable — skipping data adoption",
      );
      return;
    }

    const adopted = await adoptOrphanData(studentId);
    if (adopted > 0) {
      logger.info(
        { adopted, studentId },
        "prodBootstrap: adopted owner-less rows to student account",
      );
    }
  } catch (err) {
    logger.error({ err }, "prodBootstrap failed");
  }
}
