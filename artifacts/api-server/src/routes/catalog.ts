import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, domains, topics } from "@workspace/db";

const router: IRouter = Router();

router.get("/domains", async (_req, res): Promise<void> => {
  const rows = await db.select().from(domains).orderBy(domains.id);
  res.json(rows);
});

router.get("/topics", async (req, res): Promise<void> => {
  const domainIdRaw = req.query.domainId as string | undefined;
  const domainId = domainIdRaw ? parseInt(domainIdRaw, 10) : undefined;
  const rows = domainId
    ? await db.select().from(topics).where(eq(topics.domainId, domainId)).orderBy(topics.name)
    : await db.select().from(topics).orderBy(topics.name);
  res.json(rows);
});

export default router;
