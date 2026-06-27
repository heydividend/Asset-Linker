import { Router, type IRouter } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import {
  db,
  topicMastery,
  topics,
  domains,
  quizzes,
  quizAnswers,
  mockExams,
  readinessSnapshots,
  loginSessions,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";
import { isAdminEmail } from "../lib/admin";
import { domainBand, toScaledScore } from "../lib/scaledScore";

const router: IRouter = Router();

// Every admin route requires an admin user.
router.use(requireAdmin);

type ClerkUserLite = {
  id: string;
  emailAddresses: Array<{ id: string; emailAddress: string }>;
  primaryEmailAddressId: string | null;
  firstName: string | null;
  lastName: string | null;
  createdAt: number;
  lastSignInAt: number | null;
  banned: boolean;
};

function primaryEmail(u: ClerkUserLite): string | null {
  const p =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId) ??
    u.emailAddresses[0];
  return p?.emailAddress ?? null;
}

// GET /admin/users — all Clerk users with a lightweight progress summary.
router.get("/admin/users", async (_req, res): Promise<void> => {
  const list = await clerkClient.users.getUserList({ limit: 200 });
  const data = (list as unknown as { data: ClerkUserLite[] }).data ?? [];

  // Per-user answered/correct across all quizzes.
  const ansRows = await db
    .select({
      userId: quizzes.userId,
      answered: sql<number>`cast(count(*) as int)`,
      correct: sql<number>`cast(sum(case when ${quizAnswers.correct} then 1 else 0 end) as int)`,
    })
    .from(quizAnswers)
    .innerJoin(quizzes, eq(quizzes.id, quizAnswers.quizId))
    .groupBy(quizzes.userId);
  const ansByUser = new Map(
    ansRows.map((r) => [r.userId ?? "", { answered: r.answered, correct: r.correct }]),
  );

  // Latest readiness score per user.
  const snaps = await db
    .select()
    .from(readinessSnapshots)
    .orderBy(desc(readinessSnapshots.capturedAt));
  const readinessByUser = new Map<string, number>();
  for (const s of snaps) {
    if (s.userId && !readinessByUser.has(s.userId)) {
      readinessByUser.set(s.userId, s.score);
    }
  }

  // Last-active per user (most recent login-session heartbeat).
  const sessRows = await db
    .select({
      userId: loginSessions.userId,
      lastSeenAt: sql<string>`max(${loginSessions.lastSeenAt})`,
    })
    .from(loginSessions)
    .groupBy(loginSessions.userId);
  const lastSeenByUser = new Map(sessRows.map((r) => [r.userId, r.lastSeenAt]));

  const users = data.map((u) => {
    const email = primaryEmail(u);
    const ans = ansByUser.get(u.id);
    return {
      id: u.id,
      email,
      firstName: u.firstName,
      lastName: u.lastName,
      banned: u.banned,
      isAdmin: isAdminEmail(email),
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
      progress: {
        answered: ans?.answered ?? 0,
        correct: ans?.correct ?? 0,
        readiness: readinessByUser.get(u.id) ?? null,
        lastActiveAt: lastSeenByUser.get(u.id) ?? null,
      },
    };
  });

  res.json({ users });
});

// POST /admin/users — create a new student account.
router.post("/admin/users", async (req, res): Promise<void> => {
  const { email, password, firstName, lastName } = (req.body ?? {}) as {
    email?: string;
    password?: string;
    firstName?: string;
    lastName?: string;
  };
  if (!email || typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email)) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }
  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  try {
    const created = await clerkClient.users.createUser({
      emailAddress: [email],
      password,
      firstName: firstName?.trim() || undefined,
      lastName: lastName?.trim() || undefined,
      skipPasswordChecks: true,
    });
    res.status(201).json({ id: created.id, email });
  } catch (err) {
    const message =
      (err as { errors?: Array<{ message?: string }> })?.errors?.[0]?.message ??
      (err as Error)?.message ??
      "Failed to create user";
    res.status(400).json({ error: message });
  }
});

// PATCH /admin/users/:id — reset a user's password.
router.patch("/admin/users/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const { password } = (req.body ?? {}) as { password?: string };
  if (!password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" });
    return;
  }
  try {
    await clerkClient.users.updateUser(id, { password, skipPasswordChecks: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error)?.message ?? "Failed to update user" });
  }
});

// DELETE /admin/users/:id — remove an account.
router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  try {
    await clerkClient.users.deleteUser(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error)?.message ?? "Failed to delete user" });
  }
});

// GET /admin/users/:id/progress — detailed study progress for one user.
router.get("/admin/users/:id/progress", async (req, res): Promise<void> => {
  const { id } = req.params;

  const mastery = await db
    .select()
    .from(topicMastery)
    .where(eq(topicMastery.userId, id));
  const tRows = await db.select().from(topics);
  const dRows = await db.select().from(domains);

  const domainMastery = dRows.map((d) => {
    const tIds = tRows.filter((t) => t.domainId === d.id).map((t) => t.id);
    const ms = mastery.filter((m) => tIds.includes(m.topicId));
    const totalAtt = ms.reduce((s, m) => s + m.attempts, 0);
    const totalC = ms.reduce((s, m) => s + m.correct, 0);
    const percent = totalAtt > 0 ? (totalC / totalAtt) * 100 : 0;
    return {
      domainId: d.id,
      code: d.code,
      name: d.name,
      correct: totalC,
      total: totalAtt,
      percent: Math.round(percent),
      scaledScore: toScaledScore(percent),
      band: totalAtt > 0 ? domainBand(percent) : ("considerably lower" as const),
    };
  });

  const [{ answered }] = await db
    .select({ answered: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers)
    .innerJoin(quizzes, eq(quizzes.id, quizAnswers.quizId))
    .where(eq(quizzes.userId, id));
  const [{ correct }] = await db
    .select({ correct: sql<number>`cast(count(*) as int)` })
    .from(quizAnswers)
    .innerJoin(quizzes, eq(quizzes.id, quizAnswers.quizId))
    .where(and(eq(quizzes.userId, id), eq(quizAnswers.correct, true)));

  const recentQuizzes = await db
    .select()
    .from(quizzes)
    .where(eq(quizzes.userId, id))
    .orderBy(desc(quizzes.startedAt))
    .limit(10);

  const recentMocks = await db
    .select()
    .from(mockExams)
    .where(and(eq(mockExams.userId, id), eq(mockExams.submitted, true)))
    .orderBy(desc(mockExams.submittedAt))
    .limit(5);

  const trend = await db
    .select()
    .from(readinessSnapshots)
    .where(eq(readinessSnapshots.userId, id))
    .orderBy(desc(readinessSnapshots.capturedAt))
    .limit(30);

  const sessions = await db
    .select()
    .from(loginSessions)
    .where(eq(loginSessions.userId, id))
    .orderBy(desc(loginSessions.lastSeenAt))
    .limit(20);

  res.json({
    answered,
    correct,
    readiness: trend[0]?.score ?? null,
    domainMastery,
    recentQuizzes,
    recentMocks,
    trend: trend.slice().reverse(),
    sessions,
  });
});

// GET /admin/sessions — recent login sessions across all users.
router.get("/admin/sessions", async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(loginSessions)
    .orderBy(desc(loginSessions.lastSeenAt))
    .limit(200);
  res.json({ sessions });
});

export default router;
