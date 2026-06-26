import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, dailyQuizSets, domains, questions, topics } from "@workspace/db";
import { chatJson } from "./openaiHelpers";
import { getDomainMasteryMap } from "./domainMastery";
import { PA8_DOMAIN_DESCRIPTIONS, PA8_DOMAIN_WEIGHTS, PA8_TASKS } from "./pa8Blueprint";
import { todayStrPT } from "./today";

const DAILY_TOTAL = 50;

interface GeneratedQuestion {
  stem: string;
  choices: string[];
  correctIndex: number;
  rationale: string;
  topicId: number | null;
}

// Allocate the 50 daily questions across the five domains. The base share is
// the official PA8 exam weight, then biased toward the domains where the user is
// weakest (lower mastery → more questions) so the daily set drills weak areas
// while still mirroring the real exam mix. Every domain gets at least 2.
function allocate(
  domainRows: { id: number; code: string }[],
  masteryByDomainId: Map<number, number>,
): Map<number, number> {
  const weights = new Map<number, number>();
  let totalWeight = 0;
  for (const d of domainRows) {
    const examWeight = PA8_DOMAIN_WEIGHTS[d.code] ?? 1 / domainRows.length;
    const mastery = Math.max(0, Math.min(1, masteryByDomainId.get(d.id) ?? 0));
    const gap = 1 - mastery; // 0 mastered → 1 untouched/weak
    // Weakness multiplier in [0.5, 1.5]: weak domains earn up to 50% more.
    const w = examWeight * (0.5 + gap);
    weights.set(d.id, w);
    totalWeight += w;
  }

  const alloc = new Map<number, number>();
  const minPer = 2;
  let assigned = 0;
  for (const d of domainRows) {
    const n = Math.max(minPer, Math.round((weights.get(d.id)! / totalWeight) * DAILY_TOTAL));
    alloc.set(d.id, n);
    assigned += n;
  }
  // Reconcile rounding so the parts sum to exactly DAILY_TOTAL.
  const ordered = [...domainRows].sort(
    (a, b) => (weights.get(b.id)! - weights.get(a.id)!),
  );
  let diff = DAILY_TOTAL - assigned;
  let i = 0;
  while (diff !== 0 && ordered.length > 0) {
    const d = ordered[i % ordered.length];
    const cur = alloc.get(d.id)!;
    if (diff > 0) {
      alloc.set(d.id, cur + 1);
      diff -= 1;
    } else if (cur > minPer) {
      alloc.set(d.id, cur - 1);
      diff += 1;
    }
    i += 1;
    if (i > 1000) break;
  }
  return alloc;
}

async function generateForDomain(
  domain: { id: number; code: string; name: string },
  count: number,
  domainTopics: { id: number; name: string; description: string | null }[],
  recentStems: string[],
): Promise<GeneratedQuestion[]> {
  const tasksForDomain = PA8_TASKS.filter((t) => t.domain === domain.code);
  const taskList = tasksForDomain.map((t) => `${t.code}: ${t.statement}`).join("\n");
  const topicList = domainTopics.length
    ? domainTopics.map((t) => `${t.id}: ${t.name}${t.description ? ` — ${t.description}` : ""}`).join("\n")
    : "(no topics — use null)";
  const avoidBlock = recentStems.length
    ? `\n\nDo NOT repeat or closely paraphrase any of these recently-used questions:\n${recentStems
        .slice(0, 60)
        .map((s) => `- ${s}`)
        .join("\n")}`
    : "";

  const prompt = `Write ${count} ORIGINAL Board of Certification (BOC) Athletic Training exam questions for the domain "${domain.name}".

Domain scope (PA8): ${PA8_DOMAIN_DESCRIPTIONS[domain.code] ?? domain.name}

Tasks this domain tests (align each question to one of these):
${taskList}

Assign every question the single best-fitting topicId from this list (use the numeric id, or null if none fits):
${topicList}

STRICT RULES:
- Every question must be 100% original. NEVER copy, reproduce, or lightly reword questions from real BOC exams, retired exams, or any copyrighted question bank. Invent fresh clinical scenarios.
- BOC style: a concise clinical stem followed by exactly 4 answer choices, exactly one correct.
- correctIndex is the 0-based index of the correct choice.
- Provide a detailed 2-4 sentence rationale that explains why the answer is correct and why the key distractors are wrong.
- Vary difficulty and which choice index is correct.${avoidBlock}

Respond ONLY with JSON of the exact shape:
{"questions": [{"stem": string, "choices": [string, string, string, string], "correctIndex": number, "rationale": string, "topicId": number | null}]}`;

  const validTopicIds = new Set(domainTopics.map((t) => t.id));
  try {
    const result = await chatJson<{ questions?: GeneratedQuestion[] }>(
      prompt,
      "You are an expert Athletic Training educator writing original, high-quality BOC-style exam items grounded in the official Practice Analysis 8th Edition. You never reproduce copyrighted exam content. Respond ONLY with valid JSON.",
    );
    const list = Array.isArray(result.questions) ? result.questions : [];
    let fallbackIdx = 0;
    return list
      .filter(
        (q) =>
          q &&
          typeof q.stem === "string" &&
          Array.isArray(q.choices) &&
          q.choices.length >= 2 &&
          q.choices.every((c) => typeof c === "string") &&
          typeof q.correctIndex === "number" &&
          q.correctIndex >= 0 &&
          q.correctIndex < q.choices.length,
      )
      .map((q) => {
        // Every question must carry a topicId so it rolls up into per-domain
        // mastery (mastery is aggregated from topicMastery). When the model
        // doesn't pick a valid topic, round-robin across the domain's topics.
        let topicId: number | null = null;
        if (q.topicId != null && validTopicIds.has(q.topicId)) {
          topicId = q.topicId;
        } else if (domainTopics.length > 0) {
          topicId = domainTopics[fallbackIdx % domainTopics.length].id;
          fallbackIdx += 1;
        }
        return {
          stem: q.stem.trim(),
          choices: q.choices.map((c) => c.trim()),
          correctIndex: q.correctIndex,
          rationale: typeof q.rationale === "string" && q.rationale.trim()
            ? q.rationale.trim()
            : "Review the PA8 task this item maps to for the full rationale.",
          topicId,
        };
      });
  } catch {
    return [];
  }
}

// Returns the ordered list of question ids that make up today's 50-question
// daily quiz, generating and caching them on first request of the day. The set
// is stable for the rest of the (Pacific) day and regenerated the next day.
export async function getOrCreateDailyQuestionIds(): Promise<number[]> {
  const date = todayStrPT();
  const [existing] = await db.select().from(dailyQuizSets).where(eq(dailyQuizSets.date, date));
  if (existing && existing.questionIds.length > 0) {
    return existing.questionIds;
  }

  const domainRows = await db.select().from(domains).orderBy(domains.id);
  if (domainRows.length === 0) return [];
  const masteryByDomainId = await getDomainMasteryMap();
  const alloc = allocate(domainRows, masteryByDomainId);

  const allTopics = await db.select().from(topics);
  const topicsByDomain = new Map<number, typeof allTopics>();
  for (const t of allTopics) {
    const list = topicsByDomain.get(t.domainId) ?? [];
    list.push(t);
    topicsByDomain.set(t.domainId, list);
  }

  // Recent daily question stems (last 7 days) to steer generation away from
  // repeats.
  const since = new Date();
  since.setDate(since.getDate() - 7);
  const recent = await db
    .select({ stem: questions.stem })
    .from(questions)
    .where(and(eq(questions.sourceKind, "daily"), gte(questions.createdAt, since)))
    .orderBy(desc(questions.createdAt))
    .limit(120);
  const recentStems = recent.map((r) => r.stem);

  const perDomain = await Promise.all(
    domainRows.map((d) =>
      generateForDomain(
        { id: d.id, code: d.code, name: d.name },
        alloc.get(d.id) ?? 0,
        topicsByDomain.get(d.id) ?? [],
        recentStems,
      ).then((qs) => ({ domainId: d.id, qs })),
    ),
  );

  const toInsert: (typeof questions.$inferInsert)[] = [];
  for (const { domainId, qs } of perDomain) {
    for (const q of qs) {
      toInsert.push({
        stem: q.stem,
        choices: q.choices,
        correctIndex: q.correctIndex,
        rationale: q.rationale,
        domainId,
        topicId: q.topicId,
        sourceKind: "daily",
        enabled: true,
      });
    }
  }

  if (toInsert.length === 0) {
    // Generation failed entirely — fall back to a random mixed set from the
    // existing pool so the user still gets a daily quiz.
    const fallback = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.enabled, true))
      .orderBy(sql`random()`)
      .limit(DAILY_TOTAL);
    const ids = fallback.map((r) => r.id);
    if (ids.length === 0) return [];
    await db
      .insert(dailyQuizSets)
      .values({ date, questionIds: ids })
      .onConflictDoNothing({ target: dailyQuizSets.date });
    const [row] = await db.select().from(dailyQuizSets).where(eq(dailyQuizSets.date, date));
    return row?.questionIds ?? ids;
  }

  const inserted = await db.insert(questions).values(toInsert).returning({ id: questions.id });
  const ids = inserted.map((r) => r.id);

  // Cache the set. If another concurrent request beat us to it, keep theirs.
  await db
    .insert(dailyQuizSets)
    .values({ date, questionIds: ids })
    .onConflictDoNothing({ target: dailyQuizSets.date });
  const [row] = await db.select().from(dailyQuizSets).where(eq(dailyQuizSets.date, date));
  return row?.questionIds ?? ids;
}
