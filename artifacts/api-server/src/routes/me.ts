import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { db, loginSessions } from "@workspace/db";
import { getUserId } from "../lib/sessionId";
import { getUserEmail, isAdminEmail } from "../lib/admin";

const router: IRouter = Router();

// Lightweight identity endpoint for the web client: who am I, and am I an admin.
router.get("/me", async (req, res): Promise<void> => {
  const userId = getUserId(req, res);
  const email = await getUserEmail(userId);
  res.json({ userId, email, isAdmin: isAdminEmail(email) });
});

// Records/refreshes the current login session. The signed-in web app calls this
// once on mount; we upsert by Clerk session id so repeated mounts within the
// same session just bump `lastSeenAt` rather than creating duplicate rows.
router.post("/session/heartbeat", async (req, res): Promise<void> => {
  const userId = getUserId(req, res);
  const auth = getAuth(req);
  const clerkSessionId =
    auth?.sessionId ?? `${userId}:${new Date().toISOString().slice(0, 10)}`;
  const email = await getUserEmail(userId);
  const userAgent = req.header("user-agent")?.slice(0, 500) ?? null;
  await db
    .insert(loginSessions)
    .values({ userId, clerkSessionId, email, userAgent })
    .onConflictDoUpdate({
      target: loginSessions.clerkSessionId,
      set: { lastSeenAt: new Date(), email, userAgent },
    });
  res.json({ ok: true });
});

export default router;
