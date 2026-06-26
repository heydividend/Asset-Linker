import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, domains } from "@workspace/db";
import { getOrCreateSessionId } from "../lib/sessionId";
import { markPlanItemComplete, todayStr } from "../lib/planCompletions";
import { getReviewSheet, listReviewSheets } from "../lib/domainReviewSheets";

const router: IRouter = Router();

// List the concise, high-yield per-domain review sheets (one per PA8 domain).
router.get("/review-sheets", (_req, res): void => {
  res.json({ sheets: listReviewSheets() });
});

// Fetch a single review sheet by domain code (D1–D5) and mark the matching
// schedule item complete for today.
router.get("/review-sheets/:code", async (req, res): Promise<void> => {
  const code = String(req.params.code ?? "");
  const sheet = getReviewSheet(code);
  if (!sheet) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const sessionId = getOrCreateSessionId(req, res);
  const date = todayStr();
  const [domain] = await db.select().from(domains).where(eq(domains.code, sheet.code));
  if (domain) {
    await markPlanItemComplete(sessionId, date, `review_sheet:domain:${domain.id}`);
  }
  await markPlanItemComplete(sessionId, date, "review_sheet:any");

  res.json({
    code: sheet.code,
    title: sheet.title,
    summary: sheet.summary,
    estMinutes: sheet.estMinutes,
    markdown: sheet.markdown,
    domainId: domain?.id ?? null,
    domainName: domain?.name ?? null,
  });
});

export default router;
