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
  conversations,
  gameSessions,
  dailyQuizSets,
} from "@workspace/db";
import { requireAdmin } from "../middlewares/requireAdmin";
import { isAdminEmail } from "../lib/admin";
import { domainBand, toScaledScore } from "../lib/scaledScore";
import { getOrCreateSchedule } from "../lib/planSchedule";
import { buildTodayItems } from "./plan";
import { PASS as MOCK_PASS_PERCENT } from "./mockExams";

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

// Clerk is the authority on whether a session is still signed in (we only
// record a one-shot heartbeat locally). Returns the set of currently-active
// Clerk session ids (optionally scoped to one user), or null when the lookup
// fails so callers can degrade to "unknown" instead of guessing.
async function getActiveClerkSessionIds(
  userId?: string,
): Promise<Set<string> | null> {
  const PAGE = 100;
  const MAX_PAGES = 10; // safety cap: up to 1000 active sessions
  try {
    const ids = new Set<string>();
    for (let page = 0; page < MAX_PAGES; page++) {
      const list = await clerkClient.sessions.getSessionList({
        ...(userId ? { userId } : {}),
        status: "active",
        limit: PAGE,
        offset: page * PAGE,
      });
      const data =
        (list as unknown as { data: Array<{ id: string }> }).data ?? [];
      for (const s of data) ids.add(s.id);
      if (data.length < PAGE) break;
    }
    return ids;
  } catch {
    return null;
  }
}

// GET /admin/users/:id — basic profile info for one user.
router.get("/admin/users/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  try {
    const u = (await clerkClient.users.getUser(id)) as unknown as ClerkUserLite;
    const email = primaryEmail(u);
    res.json({
      id: u.id,
      email,
      firstName: u.firstName,
      lastName: u.lastName,
      banned: u.banned,
      isAdmin: isAdminEmail(email),
      createdAt: u.createdAt,
      lastSignInAt: u.lastSignInAt,
    });
  } catch {
    res.status(404).json({ error: "User not found" });
  }
});

// GET /admin/users/:id/plan — the user's daily study plan, exactly as they
// see it on their own dashboard (same builder, same completion state).
router.get("/admin/users/:id/plan", async (req, res): Promise<void> => {
  const { id } = req.params;
  // Verify the user exists before getOrCreateSchedule, which would otherwise
  // create an orphan schedule row for an invalid id.
  try {
    await clerkClient.users.getUser(id);
  } catch {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const sched = await getOrCreateSchedule(id);
  const today = await buildTodayItems(id);
  res.json({
    schedule: {
      startDate: sched.startDate,
      examDate: sched.examDate,
      examName: sched.examName,
    },
    today,
  });
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
  const activeIds = await getActiveClerkSessionIds(id);

  res.json({
    answered,
    correct,
    readiness: trend[0]?.score ?? null,
    domainMastery,
    recentQuizzes,
    recentMocks: recentMocks.map((m) => ({
      ...m,
      passed: m.scorePercent == null ? null : m.scorePercent >= MOCK_PASS_PERCENT,
    })),
    trend: trend.slice().reverse(),
    sessions: sessions.map((s) => ({
      ...s,
      active: activeIds ? activeIds.has(s.clerkSessionId) : null,
    })),
  });
});

type ActivityEvent = {
  id: string;
  type: "quiz" | "mock" | "daily" | "tutor" | "game";
  userId: string;
  email?: string | null;
  title: string;
  detail: string | null;
  at: string;
};

function toISO(value: Date | string | null): string | null {
  if (value == null) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function quizModeLabel(mode: string): string {
  const map: Record<string, string> = {
    practice: "practice quiz",
    daily: "daily quiz",
    review: "review quiz",
    topic: "topic quiz",
    domain: "domain quiz",
    warmup: "warm-up quiz",
    custom: "custom quiz",
  };
  return map[mode] ?? `${mode} quiz`;
}

// Build a chronological activity feed from the user-scoped tables. When
// `userId` is null the feed spans all users; otherwise it is scoped to one.
async function buildActivity(
  userId: string | null,
  perTypeLimit: number,
): Promise<ActivityEvent[]> {
  const events: ActivityEvent[] = [];

  const qs = await db
    .select()
    .from(quizzes)
    .where(
      userId
        ? and(eq(quizzes.finished, true), eq(quizzes.userId, userId))
        : eq(quizzes.finished, true),
    )
    .orderBy(desc(quizzes.finishedAt))
    .limit(perTypeLimit);
  for (const q of qs) {
    const at = toISO(q.finishedAt);
    if (!q.userId || !at) continue;
    events.push({
      id: `quiz-${q.id}`,
      type: "quiz",
      userId: q.userId,
      title: `Completed a ${quizModeLabel(q.mode)}`,
      detail: q.score != null ? `${Math.round(q.score)}%` : null,
      at,
    });
  }

  const ms = await db
    .select()
    .from(mockExams)
    .where(
      userId
        ? and(eq(mockExams.submitted, true), eq(mockExams.userId, userId))
        : eq(mockExams.submitted, true),
    )
    .orderBy(desc(mockExams.submittedAt))
    .limit(perTypeLimit);
  for (const m of ms) {
    const at = toISO(m.submittedAt);
    if (!m.userId || !at) continue;
    events.push({
      id: `mock-${m.id}`,
      type: "mock",
      userId: m.userId,
      title: "Submitted a mock exam",
      detail: m.scorePercent != null ? `${Math.round(m.scorePercent)}%` : null,
      at,
    });
  }

  const ds = await db
    .select()
    .from(dailyQuizSets)
    .where(userId ? eq(dailyQuizSets.userId, userId) : undefined)
    .orderBy(desc(dailyQuizSets.createdAt))
    .limit(perTypeLimit);
  for (const d of ds) {
    const at = toISO(d.createdAt);
    if (!d.userId || !at) continue;
    events.push({
      id: `daily-${d.id}`,
      type: "daily",
      userId: d.userId,
      title: "Started the daily quiz",
      detail: d.date,
      at,
    });
  }

  const cs = await db
    .select()
    .from(conversations)
    .where(userId ? eq(conversations.userId, userId) : undefined)
    .orderBy(desc(conversations.createdAt))
    .limit(perTypeLimit);
  for (const c of cs) {
    const at = toISO(c.createdAt);
    if (!c.userId || !at) continue;
    events.push({
      id: `tutor-${c.id}`,
      type: "tutor",
      userId: c.userId,
      title: "Started an AI tutor chat",
      detail: c.title || null,
      at,
    });
  }

  const gs = await db
    .select()
    .from(gameSessions)
    .where(userId ? eq(gameSessions.sessionId, userId) : undefined)
    .orderBy(desc(gameSessions.completedAt))
    .limit(perTypeLimit);
  for (const g of gs) {
    const at = toISO(g.completedAt);
    if (!g.sessionId || !at) continue;
    events.push({
      id: `game-${g.id}`,
      type: "game",
      userId: g.sessionId,
      title: `Played ${g.gameId}`,
      detail: `Score ${g.score}`,
      at,
    });
  }

  events.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return events;
}

// GET /admin/activity — global, chronological activity feed across all users.
const GLOBAL_ACTIVITY_LIMIT = 200;
router.get("/admin/activity", async (_req, res): Promise<void> => {
  // Per-type fetch limit must equal the global return limit: the global top-N
  // can contain at most N events of any single type, so fetching the N most
  // recent of each type guarantees the merged top-N is the true global top-N.
  const events = await buildActivity(null, GLOBAL_ACTIVITY_LIMIT);

  // Resolve userId -> email for display.
  const list = await clerkClient.users.getUserList({ limit: 200 });
  const data = (list as unknown as { data: ClerkUserLite[] }).data ?? [];
  const emailByUser = new Map<string, string | null>(
    data.map((u) => [u.id, primaryEmail(u)]),
  );

  const activity = events.slice(0, GLOBAL_ACTIVITY_LIMIT).map((e) => ({
    ...e,
    email: emailByUser.get(e.userId) ?? null,
  }));
  res.json({ activity });
});

// GET /admin/users/:id/activity — full activity timeline for one user.
router.get("/admin/users/:id/activity", async (req, res): Promise<void> => {
  const { id } = req.params;
  const activity = await buildActivity(id, 100);
  res.json({ activity });
});

// GET /admin/sessions — recent login sessions across all users.
router.get("/admin/sessions", async (_req, res): Promise<void> => {
  const sessions = await db
    .select()
    .from(loginSessions)
    .orderBy(desc(loginSessions.lastSeenAt))
    .limit(200);
  const activeIds = await getActiveClerkSessionIds();
  res.json({
    sessions: sessions.map((s) => ({
      ...s,
      active: activeIds ? activeIds.has(s.clerkSessionId) : null,
    })),
  });
});

export default router;
