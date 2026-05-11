import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { db, scrapeJobs, questions } from "@workspace/db";
import { parseId } from "../lib/parseId";
import { ALLOWLIST, isAllowed } from "../lib/scraperAllowlist";
import { chatJson } from "../lib/openaiHelpers";

const router: IRouter = Router();

router.get("/scraper/allowlist", async (_req, res): Promise<void> => {
  res.json({ allowed: ALLOWLIST });
});

router.get("/scraper/jobs", async (_req, res): Promise<void> => {
  const rows = await db.select().from(scrapeJobs).orderBy(desc(scrapeJobs.createdAt));
  res.json(rows);
});

router.get("/scraper/jobs/:id", async (req, res): Promise<void> => {
  const id = parseId(req);
  if (id == null) {
    res.status(400).json({ error: "invalid id" });
    return;
  }
  const [r] = await db.select().from(scrapeJobs).where(eq(scrapeJobs.id, id));
  if (!r) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(r);
});

router.post("/scraper/jobs", async (req, res): Promise<void> => {
  const { url } = req.body ?? {};
  if (!url || typeof url !== "string") {
    res.status(400).json({ error: "url required" });
    return;
  }
  const check = isAllowed(url);
  if (!check.ok) {
    const [job] = await db
      .insert(scrapeJobs)
      .values({
        url,
        sourceHost: check.host ?? null,
        status: "blocked",
        message: check.reason ?? "Blocked",
        completedAt: new Date(),
      })
      .returning();
    res.status(201).json(job);
    return;
  }

  const [job] = await db
    .insert(scrapeJobs)
    .values({ url, sourceHost: check.host!, status: "pending" })
    .returning();

  (async () => {
    try {
      await db.update(scrapeJobs).set({ status: "running" }).where(eq(scrapeJobs.id, job.id));
      const fetched = await fetch(url, { headers: { "user-agent": "BOCStudyNotebookBot/1.0" } });
      if (!fetched.ok) throw new Error(`HTTP ${fetched.status}`);
      const html = await fetched.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 8000);

      const result = await chatJson<{ questions: { stem: string; choices: string[]; correctIndex: number; rationale: string }[] }>(
        `Extract up to 5 high-quality multiple-choice study questions relevant to Athletic Training and the BOC exam from this public reference text. Each question MUST have 4 choices, one correctIndex (0-3), and a clear rationale. If the text is not appropriate for BOC study, return {"questions":[]}.\n\nTEXT:\n${text}\n\nReturn JSON: {"questions":[{"stem":"...","choices":["A","B","C","D"],"correctIndex":0,"rationale":"..."}]}`,
      );

      const valid = (result.questions ?? []).filter(
        (q) =>
          q.stem &&
          Array.isArray(q.choices) &&
          q.choices.length === 4 &&
          typeof q.correctIndex === "number" &&
          q.correctIndex >= 0 &&
          q.correctIndex <= 3 &&
          q.rationale,
      );

      if (valid.length > 0) {
        await db.insert(questions).values(
          valid.map((q) => ({
            stem: q.stem,
            choices: q.choices,
            correctIndex: q.correctIndex,
            rationale: q.rationale,
            sourceKind: "scraped",
            sourceUrl: url,
            enabled: false,
            pendingReview: true,
          })),
        );
      }

      await db
        .update(scrapeJobs)
        .set({
          status: "complete",
          importedCount: valid.length,
          pendingReviewCount: valid.length,
          completedAt: new Date(),
          message: valid.length === 0 ? "No suitable questions found." : null,
        })
        .where(eq(scrapeJobs.id, job.id));
    } catch (err: any) {
      await db
        .update(scrapeJobs)
        .set({ status: "failed", message: String(err?.message ?? err), completedAt: new Date() })
        .where(eq(scrapeJobs.id, job.id));
    }
  })();

  res.status(202).json(job);
});

export default router;
