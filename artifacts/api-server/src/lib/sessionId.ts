import { randomBytes } from "crypto";
import type { Request, Response } from "express";

export const SESSION_COOKIE = "boc_sid";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Returns a stable anonymous session id from the request cookie, creating
 * and persisting one in a long-lived cookie when missing. This lets us
 * scope per-user data (like fix-it streaks) without a real auth system —
 * each browser/device gets its own id, which is exactly what the user
 * thinks of as "their" streak.
 */
export function getOrCreateSessionId(req: Request, res: Response): string {
  const existing = req.cookies?.[SESSION_COOKIE];
  if (typeof existing === "string" && /^[A-Za-z0-9_-]{16,}$/.test(existing)) {
    return existing;
  }
  const fresh = randomBytes(24).toString("base64url");
  res.cookie(SESSION_COOKIE, fresh, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS * 1000,
    path: "/",
  });
  return fresh;
}
