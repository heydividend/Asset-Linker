import type { Request, Response, NextFunction } from "express";
import { isAdminUser } from "../lib/admin";

/**
 * Gate that requires the authenticated user to be an admin (their Clerk email
 * is in `ADMIN_EMAILS`). Must run AFTER `requireAuth`, which sets `req.userId`.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const userId = (req as Request & { userId?: string }).userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  isAdminUser(userId)
    .then((ok) => {
      if (!ok) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      next();
    })
    .catch(() => res.status(403).json({ error: "Forbidden" }));
}
