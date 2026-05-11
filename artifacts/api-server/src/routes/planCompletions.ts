import { Router, type IRouter } from "express";
import { getOrCreateSessionId } from "../lib/sessionId";
import { listCompletedKeys, markPlanItemComplete, todayStr } from "../lib/planCompletions";

const router: IRouter = Router();

router.get("/plan/today/completions", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const date = todayStr();
  const completedKeys = await listCompletedKeys(sessionId, date);
  res.json({ date, completedKeys });
});

router.post("/plan/today/complete", async (req, res): Promise<void> => {
  const sessionId = getOrCreateSessionId(req, res);
  const { itemKey } = req.body ?? {};
  if (typeof itemKey !== "string" || !itemKey) {
    res.status(400).json({ error: "itemKey required" });
    return;
  }
  const date = todayStr();
  await markPlanItemComplete(sessionId, date, itemKey);
  const completedKeys = await listCompletedKeys(sessionId, date);
  res.json({ date, completedKeys });
});

export default router;
