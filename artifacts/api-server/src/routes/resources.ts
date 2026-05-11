import { Router, type IRouter } from "express";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, resources, topicMastery, topics } from "@workspace/db";
import { parseId } from "../lib/parseId";

const router: IRouter = Router();

router.get("/resources", async (req, res): Promise<void> => {
  const topicId = req.query.topicId ? parseInt(req.query.topicId as string, 10) : undefined;
  const domainId = req.query.domainId ? parseInt(req.query.domainId as string, 10) : undefined;
  const kind = (req.query.kind as string | undefined) ?? undefined;
  const conds = [];
  if (topicId) conds.push(eq(resources.topicId, topicId));
  if (domainId) conds.push(eq(resources.domainId, domainId));
  if (kind) conds.push(eq(resources.kind, kind));
  const rows = await (conds.length
    ? db.select().from(resources).where(and(...conds)).orderBy(desc(resources.createdAt))
    : db.select().from(resources).orderBy(desc(resources.createdAt)));
  res.json(rows);
});

router.post("/resources", async (req, res): Promise<void> => {
  const { title, url, kind, provider, topicId, domainId, notes } = req.body ?? {};
  if (!title || !url || !kind) {
    res.status(400).json({ error: "title, url, kind required" });
    return;
  }
  const [r] = await db
    .insert(resources)
    .values({
      title,
      url,
      kind,
      provider: provider ?? null,
      topicId: topicId ?? null,
      domainId: domainId ?? null,
      notes: notes ?? null,
    })
    .returning();
  res.status(201).json(r);
});

router.delete("/resources/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  await db.delete(resources).where(eq(resources.id, id));
  res.sendStatus(204);
});

router.get("/resources/recommended", async (_req, res): Promise<void> => {
  const weak = await db
    .select()
    .from(topicMastery)
    .orderBy(topicMastery.mastery)
    .limit(5);
  const tids = weak.map((w) => w.topicId);
  if (tids.length === 0) {
    res.json([]);
    return;
  }
  const tRows = await db.select().from(topics).where(inArray(topics.id, tids));
  const dids = Array.from(new Set(tRows.map((t) => t.domainId)));
  const rec = await db
    .select()
    .from(resources)
    .where(
      tids.length > 0 || dids.length > 0
        ? inArray(resources.topicId, tids)
        : eq(resources.id, -1),
    )
    .orderBy(desc(resources.createdAt));
  res.json(rec);
});

export default router;
