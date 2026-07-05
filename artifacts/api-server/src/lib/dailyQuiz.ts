import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, dailyQuizSets, domains, questions, testlets, topics } from "@workspace/db";
import { chatJson } from "./openaiHelpers";
import { getDomainMasteryMap } from "./domainMastery";
import { PA8_DOMAIN_DESCRIPTIONS, PA8_DOMAIN_WEIGHTS, PA8_TASKS } from "./pa8Blueprint";
import { todayStrPT } from "./today";

const DAILY_TOTAL = 50;
// Each daily set reserves a few slots for the richer AI item types so students
// practice them every day. The remainder are ordinary single-answer MC. If the
// extra types fail to generate we backfill from the pool to still hit 50.
const ORDERING_COUNT = 3; // drag-and-drop sequencing items
const TESTLET_SIZE = 3; // one testlet's worth of scenario-linked MC sub-items
const MC_TOTAL = DAILY_TOTAL - ORDERING_COUNT - TESTLET_SIZE;

interface GeneratedQuestion {
  stem: string;
  choices: string[];
  correctIndex: number;
  rationale: string;
  topicId: number | null;
}

interface GeneratedOrdering {
  stem: string;
  steps: string[]; // in CORRECT order as returned by the model
  rationale: string;
  domainId: number;
  topicId: number | null;
}

interface GeneratedTestlet {
  scenario: string;
  domainId: number;
  topicId: number | null;
  questions: GeneratedQuestion[];
}

// Fisher–Yates shuffle of a fresh copy — used to scramble ordering steps so the
// stored choices aren't already in the correct sequence.
function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Spread each chunk roughly evenly through `base` (used to distribute the special
// item types among the MC ids instead of clustering them at the end). Testlet
// sub-items travel together as one chunk so they stay adjacent.
function interleaveChunks(base: number[], chunks: number[][]): number[] {
  const nonEmpty = chunks.filter((c) => c.length > 0);
  if (nonEmpty.length === 0) return base;
  const result = [...base];
  const step = Math.max(1, Math.floor(base.length / (nonEmpty.length + 1)));
  let offset = step;
  for (const chunk of nonEmpty) {
    const pos = Math.min(offset, result.length);
    result.splice(pos, 0, ...chunk);
    offset += step + chunk.length;
  }
  return result;
}

// Allocate the 50 daily questions across the five domains. The base share is
// the official PA8 exam weight, then biased toward the domains where the user is
// weakest (lower mastery → more questions) so the daily set drills weak areas
// while still mirroring the real exam mix. Every domain gets at least 2.
function allocate(
  domainRows: { id: number; code: string }[],
  masteryByDomainId: Map<number, number>,
  total: number,
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
    const n = Math.max(minPer, Math.round((weights.get(d.id)! / totalWeight) * total));
    alloc.set(d.id, n);
    assigned += n;
  }
  // Reconcile rounding so the parts sum to exactly `total`.
  const ordered = [...domainRows].sort(
    (a, b) => (weights.get(b.id)! - weights.get(a.id)!),
  );
  let diff = total - assigned;
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

// Generate a batch of drag-and-drop ordering items spread across domains. Each
// item is a task plus 4–6 steps the model returns in CORRECT order; the caller
// scrambles them for storage. Returns [] on any failure (the daily set backfills).
async function generateOrdering(
  domainRows: { id: number; code: string; name: string }[],
  allTopics: { id: number; name: string; domainId: number }[],
  count: number,
  recentStems: string[],
): Promise<GeneratedOrdering[]> {
  if (count <= 0 || domainRows.length === 0) return [];
  const domainList = domainRows.map((d) => `${d.code}: ${d.name}`).join("\n");
  const topicList = allTopics.length
    ? allTopics.map((t) => `${t.id}: ${t.name}`).join("\n")
    : "(no topics — use null)";
  const avoidBlock = recentStems.length
    ? `\n\nDo NOT repeat or closely paraphrase these recently-used items:\n${recentStems.slice(0, 40).map((s) => `- ${s}`).join("\n")}`
    : "";
  const prompt = `Write ${count} ORIGINAL Board of Certification (BOC) Athletic Training "put the steps in the correct order" (ordering / drag-and-drop) items.

Each item is a clinical or procedural task whose steps must be performed in a specific correct sequence (e.g. steps of a special test, an emergency action plan, a taping procedure, or a rehab progression).

Domains (set each item's domainCode to one of these):
${domainList}

Assign every item the single best-fitting topicId from this list (numeric id, or null):
${topicList}

STRICT RULES:
- 100% original content. NEVER copy real BOC, retired exam, or copyrighted items.
- "steps" MUST be listed in the CORRECT order.
- 4 to 6 steps per item, each a concise phrase.
- Provide a 2-4 sentence rationale explaining why this ordering is correct.${avoidBlock}

Respond ONLY with JSON of the exact shape:
{"items": [{"stem": string, "steps": [string, ...], "rationale": string, "domainCode": string, "topicId": number | null}]}`;

  const domainByCode = new Map(domainRows.map((d) => [d.code, d.id]));
  const topicById = new Map(allTopics.map((t) => [t.id, t]));
  try {
    const result = await chatJson<{
      items?: Array<{ stem: string; steps: string[]; rationale: string; domainCode: string; topicId: number | null }>;
    }>(
      prompt,
      "You are an expert Athletic Training educator writing original BOC-style ordering items grounded in the Practice Analysis 8th Edition. You never reproduce copyrighted content. Respond ONLY with valid JSON.",
    );
    const list = Array.isArray(result.items) ? result.items : [];
    const out: GeneratedOrdering[] = [];
    for (const it of list) {
      if (!it || typeof it.stem !== "string" || !Array.isArray(it.steps)) continue;
      const steps = it.steps.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()).slice(0, 6);
      if (steps.length < 3) continue;
      const domainId = domainByCode.get(it.domainCode) ?? domainRows[out.length % domainRows.length].id;
      let topicId: number | null = null;
      const t = it.topicId != null ? topicById.get(it.topicId) : undefined;
      if (t && t.domainId === domainId) topicId = t.id;
      else {
        const domTopics = allTopics.filter((x) => x.domainId === domainId);
        if (domTopics.length) topicId = domTopics[out.length % domTopics.length].id;
      }
      out.push({
        stem: it.stem.trim(),
        steps,
        rationale: typeof it.rationale === "string" && it.rationale.trim() ? it.rationale.trim() : "Review the correct sequence for this procedure.",
        domainId,
        topicId,
      });
      if (out.length >= count) break;
    }
    return out;
  } catch {
    return [];
  }
}

// Generate one testlet: a shared clinical scenario plus `count` linked
// single-answer MC sub-questions. The caller prefixes the scenario into each
// sub-question's stem so they render as ordinary MC everywhere. Null on failure.
async function generateTestlet(
  domainRows: { id: number; code: string; name: string }[],
  allTopics: { id: number; name: string; domainId: number }[],
  count: number,
  recentStems: string[],
): Promise<GeneratedTestlet | null> {
  if (count <= 0 || domainRows.length === 0) return null;
  const domainList = domainRows.map((d) => `${d.code}: ${d.name}`).join("\n");
  const topicList = allTopics.length
    ? allTopics.map((t) => `${t.id}: ${t.name}`).join("\n")
    : "(no topics — use null)";
  const avoidBlock = recentStems.length
    ? `\n\nAvoid reusing these recent scenarios/questions:\n${recentStems.slice(0, 30).map((s) => `- ${s}`).join("\n")}`
    : "";
  const prompt = `Write ONE ORIGINAL Board of Certification (BOC) Athletic Training TESTLET: a single detailed clinical scenario followed by ${count} linked single-answer multiple-choice questions that all reference that same scenario.

Domains (set the testlet's domainCode to one of these):
${domainList}

Assign every sub-question the single best-fitting topicId from this list (numeric id, or null):
${topicList}

STRICT RULES:
- 100% original content. NEVER copy real BOC, retired exam, or copyrighted content.
- "scenario" is 3-6 sentences establishing a patient/case.
- Exactly ${count} sub-questions, each with exactly 4 choices and exactly one correct answer (correctIndex is 0-based).
- Each sub-question must be answerable from the shared scenario but ask something distinct.
- Each sub-question gets a 2-4 sentence rationale.${avoidBlock}

Respond ONLY with JSON of the exact shape:
{"scenario": string, "domainCode": string, "questions": [{"stem": string, "choices": [string, string, string, string], "correctIndex": number, "rationale": string, "topicId": number | null}]}`;

  const domainByCode = new Map(domainRows.map((d) => [d.code, d.id]));
  const topicById = new Map(allTopics.map((t) => [t.id, t]));
  try {
    const result = await chatJson<{ scenario?: string; domainCode?: string; questions?: GeneratedQuestion[] }>(
      prompt,
      "You are an expert Athletic Training educator writing an original BOC-style testlet grounded in the Practice Analysis 8th Edition. You never reproduce copyrighted content. Respond ONLY with valid JSON.",
    );
    if (!result || typeof result.scenario !== "string" || !result.scenario.trim() || !Array.isArray(result.questions)) return null;
    const domainId = domainByCode.get(result.domainCode ?? "") ?? domainRows[0].id;
    const valid = result.questions.filter(
      (q) =>
        q &&
        typeof q.stem === "string" &&
        Array.isArray(q.choices) &&
        q.choices.length >= 2 &&
        q.choices.every((c) => typeof c === "string") &&
        typeof q.correctIndex === "number" &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.choices.length,
    );
    if (valid.length === 0) return null;
    const domTopics = allTopics.filter((x) => x.domainId === domainId);
    let fb = 0;
    const questionsOut: GeneratedQuestion[] = valid.slice(0, count).map((q) => {
      let topicId: number | null = null;
      const t = q.topicId != null ? topicById.get(q.topicId) : undefined;
      if (t && t.domainId === domainId) topicId = t.id;
      else if (domTopics.length) {
        topicId = domTopics[fb % domTopics.length].id;
        fb += 1;
      }
      return {
        stem: q.stem.trim(),
        choices: q.choices.map((c) => c.trim()),
        correctIndex: q.correctIndex,
        rationale: typeof q.rationale === "string" && q.rationale.trim() ? q.rationale.trim() : "Review the scenario details for the rationale.",
        topicId,
      };
    });
    const firstTopic = questionsOut.find((q) => q.topicId != null)?.topicId ?? null;
    return { scenario: result.scenario.trim(), domainId, topicId: firstTopic, questions: questionsOut };
  } catch {
    return null;
  }
}

// Returns the ordered list of question ids that make up today's 50-question
// daily quiz, generating and caching them on first request of the day. The set
// is stable for the rest of the (Pacific) day and regenerated the next day.
export async function getOrCreateDailyQuestionIds(userId: string): Promise<number[]> {
  const date = todayStrPT();
  const [existing] = await db
    .select()
    .from(dailyQuizSets)
    .where(and(eq(dailyQuizSets.userId, userId), eq(dailyQuizSets.date, date)));
  if (existing && existing.questionIds.length > 0) {
    return existing.questionIds;
  }

  const domainRows = await db.select().from(domains).orderBy(domains.id);
  if (domainRows.length === 0) return [];
  const masteryByDomainId = await getDomainMasteryMap(userId);
  const alloc = allocate(domainRows, masteryByDomainId, MC_TOTAL);

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

  const [perDomain, orderingItems, testlet] = await Promise.all([
    Promise.all(
      domainRows.map((d) =>
        generateForDomain(
          { id: d.id, code: d.code, name: d.name },
          alloc.get(d.id) ?? 0,
          topicsByDomain.get(d.id) ?? [],
          recentStems,
        ).then((qs) => ({ domainId: d.id, qs })),
      ),
    ),
    generateOrdering(domainRows, allTopics, ORDERING_COUNT, recentStems),
    generateTestlet(domainRows, allTopics, TESTLET_SIZE, recentStems),
  ]);

  // Insert the single-answer MC, capped at the MC budget so the whole set stays
  // at ~50 once the special item types are added in.
  const mcInsert: (typeof questions.$inferInsert)[] = [];
  for (const { domainId, qs } of perDomain) {
    for (const q of qs) {
      mcInsert.push({
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
  const mcIds = mcInsert.length
    ? (await db.insert(questions).values(mcInsert.slice(0, MC_TOTAL)).returning({ id: questions.id })).map((r) => r.id)
    : [];

  // Insert drag-and-drop ordering items. choices are stored SCRAMBLED; correctOrder
  // holds the choice indices in their correct sequence (see the questions schema).
  const orderingInsert: (typeof questions.$inferInsert)[] = orderingItems.map((it) => {
    const n = it.steps.length;
    const perm = shuffled([...Array(n).keys()]); // perm[displayPos] = correct step idx
    const choices = perm.map((orig) => it.steps[orig]);
    const correctOrder = [...Array(n).keys()].map((k) => perm.indexOf(k));
    return {
      stem: it.stem,
      choices,
      correctIndex: correctOrder[0] ?? 0,
      itemType: "ordering",
      correctOrder,
      rationale: it.rationale,
      domainId: it.domainId,
      topicId: it.topicId,
      sourceKind: "daily",
      enabled: true,
    };
  });
  const orderingIds = orderingInsert.length
    ? (await db.insert(questions).values(orderingInsert).returning({ id: questions.id })).map((r) => r.id)
    : [];

  // Insert the testlet: one scenario row, then its MC sub-items with the shared
  // scenario prefixed into each stem so they render in any runner as plain MC.
  let testletIds: number[] = [];
  if (testlet && testlet.questions.length > 0) {
    const [tl] = await db
      .insert(testlets)
      .values({ scenario: testlet.scenario, domainId: testlet.domainId, topicId: testlet.topicId, sourceKind: "ai", enabled: true })
      .returning({ id: testlets.id });
    if (tl) {
      const tqInsert: (typeof questions.$inferInsert)[] = testlet.questions.map((q) => ({
        stem: `${testlet.scenario}\n\n${q.stem}`,
        choices: q.choices,
        correctIndex: q.correctIndex,
        rationale: q.rationale,
        domainId: testlet.domainId,
        topicId: q.topicId,
        testletId: tl.id,
        sourceKind: "daily",
        enabled: true,
      }));
      testletIds = (await db.insert(questions).values(tqInsert).returning({ id: questions.id })).map((r) => r.id);
    }
  }

  // Weave the special item types among the MC, then backfill from the pool if we
  // came up short (e.g. an AI call failed) so the set still totals 50.
  let finalIds = interleaveChunks(mcIds, [...orderingIds.map((id) => [id]), testletIds]);
  if (finalIds.length < DAILY_TOTAL) {
    const exclude = new Set(finalIds);
    const need = DAILY_TOTAL - finalIds.length;
    const pool = await db
      .select({ id: questions.id })
      .from(questions)
      .where(eq(questions.enabled, true))
      .orderBy(sql`random()`)
      .limit(need * 3 + 10);
    for (const r of pool) {
      if (finalIds.length >= DAILY_TOTAL) break;
      if (!exclude.has(r.id)) {
        finalIds.push(r.id);
        exclude.add(r.id);
      }
    }
  }
  finalIds = finalIds.slice(0, DAILY_TOTAL);
  if (finalIds.length === 0) return [];

  // Cache the set. If another concurrent request beat us to it, keep theirs.
  await db
    .insert(dailyQuizSets)
    .values({ userId, date, questionIds: finalIds })
    .onConflictDoNothing({ target: [dailyQuizSets.userId, dailyQuizSets.date] });
  const [row] = await db
    .select()
    .from(dailyQuizSets)
    .where(and(eq(dailyQuizSets.userId, userId), eq(dailyQuizSets.date, date)));
  return row?.questionIds ?? finalIds;
}

// Delete today's cached daily set so the next request regenerates a brand-new
// one. Backs the "Regenerate today's set" action.
export async function clearTodayDailySet(userId: string): Promise<void> {
  const date = todayStrPT();
  await db
    .delete(dailyQuizSets)
    .where(and(eq(dailyQuizSets.userId, userId), eq(dailyQuizSets.date, date)));
}
