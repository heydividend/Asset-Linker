import type { Request, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { SESSION_COOKIE } from "../lib/sessionId";

/**
 * Test-only escape hatch. When `ALLOW_TEST_AUTH=1` is set (the test script sets
 * it; it is never set in dev or production) and the request carries an
 * `x-test-user-id` header or a `boc_sid` cookie, that value is used as the
 * authenticated user id. This lets the integration tests exercise per-user
 * scoping (including two-account isolation) without a real Clerk session. It is
 * hard-disabled in production regardless of the flag.
 */
function testUserId(req: Request): string | null {
  if (process.env.ALLOW_TEST_AUTH !== "1" || process.env.NODE_ENV === "production") {
    return null;
  }
  const header = req.header("x-test-user-id");
  if (header) return header;
  const cookie = (req as Request & { cookies?: Record<string, string> }).cookies?.[
    SESSION_COOKIE
  ];
  return cookie ?? null;
}

/**
 * Gate that requires an authenticated Clerk user. Resolves the user id from
 * the Clerk session and stashes it on `req.userId` for downstream handlers
 * (and for `getOrCreateSessionId`/`getUserId`). Returns 401 when there is no
 * authenticated user.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  let userId =
    (auth?.sessionClaims as { userId?: string } | null)?.userId ??
    auth?.userId ??
    null;
  if (!userId) userId = testUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as Request & { userId?: string }).userId = userId;
  next();
}
