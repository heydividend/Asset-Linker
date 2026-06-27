import type { Request, Response } from "express";
import { getAuth } from "@clerk/express";

export const SESSION_COOKIE = "boc_sid";

/**
 * Returns the authenticated user's stable id (Clerk user id). This is the
 * scoping key for every per-user table in the app. `requireAuth` runs before
 * the data routes and sets `req.userId`, so this normally just reads that;
 * it falls back to `getAuth(req)` and throws a 401-tagged error if there is
 * no authenticated user.
 *
 * Historically this returned an anonymous cookie id and took a `(req, res)`
 * signature. The optional, unused `res` param is kept so the many existing
 * call sites that pass `(req, res)` keep compiling unchanged — they now
 * transparently scope by the logged-in user instead of a browser cookie.
 */
export function getOrCreateSessionId(req: Request, _res?: Response): string {
  const fromReq = (req as Request & { userId?: string }).userId;
  if (fromReq) return fromReq;
  const auth = getAuth(req);
  const userId =
    (auth?.sessionClaims as { userId?: string } | null)?.userId ?? auth?.userId;
  if (!userId) {
    throw Object.assign(new Error("Unauthorized"), { status: 401 });
  }
  return userId;
}

/** Clearer alias for new code that scopes data by the authenticated user. */
export const getUserId = getOrCreateSessionId;
