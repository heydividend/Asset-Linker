/**
 * Import a BOC-style question bank (JSON) into the `questions` table, classified
 * to the official PA8 blueprint so quizzes and the mock exam draw from real,
 * exam-weighted content — including multi-select items, which the hand-seeded
 * bank lacks entirely.
 *
 * For each question it:
 *   1. converts answer letters → indices (correctIndex + correctIndices);
 *   2. asks Claude to classify it to a PA8 domain (D1–D5), task (0101…), an
 *      existing topic (or none), and a difficulty (1–3), grounded in the
 *      blueprint and the seeded topic list;
 *   3. inserts it with sourceKind="bank", folding any shared scenario into the
 *      stem so focused-testlet context is preserved.
 *
 * Idempotent: skips any question whose normalized stem already exists, so it is
 * safe to re-run and to layer in additional bank files (e.g. the Prentice bank).
 *
 * Input JSON item shape (either correctLetters OR correctIndices is accepted):
 *   { stem, choices: string[], correctLetters?: ["a","c"], correctIndices?: [0,2],
 *     multiSelect: boolean, rationale: string, scenario?: string|null }
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx ./src/importQuestions.ts [files...] [flags]
 *
 *   files...           one or more JSON bank files (default: every *.json in scripts/data/)
 *   --concurrency N    classify N questions in parallel (default 4)
 *   --batch N          questions per classification call (default 12)
 *   --dry-run          classify + report, write nothing
 *   --limit N          only process the first N questions (smoke test)
 *
 * Requires: DATABASE_URL, AI_INTEGRATIONS_ANTHROPIC_* env vars.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { db, domains, tasks, topics, questions } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";

const MODEL = "claude-opus-4-8"; // classification is mechanical — "claude-haiku-4-5" is much cheaper
const MAX_TOKENS = 4_000;
const DATA_DIR = path.resolve(import.meta.dirname, "..", "data");

type RawQuestion = {
  stem: string;
  choices: string[];
  correctLetters?: string[];
  correctIndices?: number[];
  multiSelect?: boolean;
  rationale?: string;
  scenario?: string | null;
};

type Args = { files: string[]; concurrency: number; batch: number; dryRun: boolean; limit: number; keepMedia: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { files: [], concurrency: 4, batch: 12, dryRun: false, limit: Infinity, keepMedia: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--") continue;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--keep-media") args.keepMedia = true; // by default, skip questions that reference a missing figure/video
    else if (a === "--concurrency") args.concurrency = Math.max(1, Number(rest[++i]) || 4);
    else if (a === "--batch") args.batch = Math.max(1, Number(rest[++i]) || 12);
    else if (a === "--limit") args.limit = Math.max(1, Number(rest[++i]) || Infinity);
    else if (!a.startsWith("--")) args.files.push(path.resolve(a));
    else throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

// Stems that reference an image/figure/video the question can't be answered
// without. These come from textbook test banks where the figure didn't survive
// PDF extraction — verified at ~12% of the Prentice bank. Skipped by default.
const MEDIA_REF = /\b(figure|picture|illustrat|shown above|shown below|pictured|depicted|diagram|this image|the video|following photo|match the (exercise|following))\b/i;

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const letterToIndex = (l: string) => l.trim().toLowerCase().charCodeAt(0) - 97; // a→0

/** Resolve a raw item's correct answer indices, validated against its choices. */
function resolveCorrect(q: RawQuestion): number[] | null {
  let idx: number[];
  if (Array.isArray(q.correctIndices) && q.correctIndices.length) idx = q.correctIndices;
  else if (Array.isArray(q.correctLetters) && q.correctLetters.length) idx = q.correctLetters.map(letterToIndex);
  else return null;
  idx = [...new Set(idx)].sort((a, b) => a - b);
  if (idx.some((i) => !Number.isInteger(i) || i < 0 || i >= q.choices.length)) return null;
  return idx;
}

// Compact PA8 blueprint for grounding the classifier (domains + the 24 tasks).
const BLUEPRINT = `BOC PA8 DOMAINS (exam weight): D1 Risk Reduction, Wellness & Health Literacy (20%); D2 Assessment, Evaluation & Diagnosis (25.6%); D3 Critical Incident Management (20.8%); D4 Therapeutic Intervention (25.6%); D5 Healthcare Administration & Professional Responsibility (8%).
TASKS: 0101 identify risk factors/screening; 0102 implement risk-reduction plans; 0103 promote health literacy/education; 0104 optimize wellness; 0105 environmental safety (heat/cold/lightning/surfaces); 0201 history/interview; 0202 physical exam/special tests; 0203 formulate clinical diagnosis; 0204 establish plan of care; 0205 educate on diagnosis/prognosis; 0301 Emergency Action Plans; 0302 triage severity; 0303 emergent care (CPR/AED/c-spine/airway/heat stroke/anaphylaxis/hemorrhage); 0304 assess the scene; 0401 develop/update plan of care; 0402 educate during intervention; 0403 prescribe therapeutic exercise; 0404 therapeutic modalities/devices; 0405 manual therapy; 0406 functional status/return-to-play; 0407 manage general medical conditions/pharmacology; 0501 quality-improvement/outcomes; 0502 policies & procedures; 0503 laws/regulations/professional standards (HIPAA/FERPA/scope/ethics); 0504 documentation/SOAP.`;

type Classification = { domain: string; task: string; topicId: number | null; difficulty: number };

async function classifyBatch(
  items: { i: number; stem: string }[],
  topicCatalog: string,
  validTopicIds: Set<number>,
): Promise<Map<number, Classification>> {
  const prompt = `Classify each athletic-training exam question to the BOC PA8 blueprint.

${BLUEPRINT}

EXISTING TOPICS (pick the single best fit by id, or null if none fits well):
${topicCatalog}

Return ONLY JSON: {"items":[{"i":<i>,"domain":"D2","task":"0202","topicId":<id or null>,"difficulty":<1=recall,2=application,3=analysis>}]}. Use a task code that belongs to the chosen domain.

QUESTIONS:
${items.map((it) => `i=${it.i}: ${it.stem}`).join("\n---\n")}`;

  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: "You classify athletic-training board-exam questions to an official blueprint. Respond with valid JSON only, no prose.",
    messages: [{ role: "user", content: prompt }],
  });
  const text = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const parsed = JSON.parse(json) as { items?: Array<{ i: number; domain: string; task: string; topicId: number | null; difficulty: number }> };
  const out = new Map<number, Classification>();
  for (const it of parsed.items ?? []) {
    if (!Number.isInteger(it.i)) continue;
    const topicId = it.topicId != null && validTopicIds.has(Number(it.topicId)) ? Number(it.topicId) : null;
    const difficulty = [1, 2, 3].includes(it.difficulty) ? it.difficulty : 2;
    out.set(it.i, { domain: it.domain, task: it.task, topicId, difficulty });
  }
  return out;
}

/** Run async tasks with a fixed concurrency cap. */
async function pool<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const args = parseArgs(process.argv);

  // Resolve input files (explicit, or every *.json in scripts/data/).
  let files = args.files;
  if (files.length === 0) {
    const entries = await readdir(DATA_DIR).catch(() => [] as string[]);
    files = entries.filter((f) => f.toLowerCase().endsWith(".json")).map((f) => path.join(DATA_DIR, f)).sort();
  }
  if (files.length === 0) {
    console.log(`No bank files found (looked in ${DATA_DIR}).`);
    return;
  }

  // Load raw questions from all files.
  const raw: RawQuestion[] = [];
  for (const f of files) {
    const parsed = JSON.parse(await readFile(f, "utf8")) as RawQuestion[];
    raw.push(...parsed);
    console.log(`Loaded ${parsed.length} from ${path.basename(f)}`);
  }

  // Reference data.
  const [dRows, taskRows, topicRows, existing] = await Promise.all([
    db.select().from(domains),
    db.select().from(tasks),
    db.select().from(topics),
    db.select({ stem: questions.stem }).from(questions),
  ]);
  const domainIdByCode = new Map(dRows.map((d) => [d.code, d.id]));
  const taskIdByCode = new Map(taskRows.map((t) => [t.code, t.id]));
  const validTopicIds = new Set(topicRows.map((t) => t.id));
  const seenStems = new Set(existing.map((q) => normalize(q.stem)));
  const topicCatalog = topicRows
    .map((t) => `id=${t.id} [${dRows.find((d) => d.id === t.domainId)?.code ?? "?"}] ${t.name}`)
    .join("\n");
  if (dRows.length === 0) throw new Error("No domains seeded — run the seed script first.");

  // Filter to importable, new questions.
  const pending: { i: number; q: RawQuestion; correct: number[] }[] = [];
  let skippedDup = 0;
  let skippedBad = 0;
  let skippedMedia = 0;
  for (const q of raw) {
    if (pending.length >= args.limit) break;
    if (!q.stem || !Array.isArray(q.choices) || q.choices.length < 2) { skippedBad++; continue; }
    if (!args.keepMedia && MEDIA_REF.test(q.stem)) { skippedMedia++; continue; }
    const correct = resolveCorrect(q);
    if (!correct) { skippedBad++; continue; }
    const stem = q.scenario ? `${q.scenario.trim()}\n\n${q.stem.trim()}` : q.stem.trim();
    if (seenStems.has(normalize(stem))) { skippedDup++; continue; }
    seenStems.add(normalize(stem));
    pending.push({ i: pending.length, q: { ...q, stem }, correct });
  }
  console.log(
    `${pending.length} to import (${skippedDup} dup, ${skippedBad} unparseable` +
      `${args.keepMedia ? "" : `, ${skippedMedia} figure/video-dependent`}).`,
  );
  if (pending.length === 0) return;

  // Classify in batches, batches run with the concurrency cap.
  const batches: { i: number; stem: string }[][] = [];
  for (let i = 0; i < pending.length; i += args.batch) {
    batches.push(pending.slice(i, i + args.batch).map((p) => ({ i: p.i, stem: p.q.stem })));
  }
  const classifications = new Map<number, Classification>();
  let done = 0;
  await pool(batches, args.concurrency, async (b) => {
    try {
      const res = await classifyBatch(b, topicCatalog, validTopicIds);
      for (const [k, v] of res) classifications.set(k, v);
    } catch (err) {
      console.error(`  classify batch failed (${(err as Error).message}) — items default to D2/0203`);
    }
    done += b.length;
    process.stdout.write(`  classified ${done}/${pending.length}\r`);
  });
  process.stdout.write("\n");

  // Build rows.
  const rows = pending.map(({ i, q, correct }) => {
    const c = classifications.get(i);
    const domainId = (c && domainIdByCode.get(c.domain)) ?? domainIdByCode.get("D2")!;
    const taskId = (c && taskIdByCode.get(c.task)) ?? null;
    const multiSelect = !!q.multiSelect || correct.length > 1;
    return {
      stem: q.stem,
      choices: q.choices,
      correctIndex: correct[0],
      multiSelect,
      correctIndices: multiSelect ? correct : null,
      rationale: q.rationale?.trim() || "No rationale provided.",
      domainId,
      topicId: c?.topicId ?? null,
      taskId,
      difficulty: c?.difficulty ?? 2,
      sourceKind: "bank",
      enabled: true,
      pendingReview: false,
    };
  });

  // Report per-domain distribution.
  const byDomain = new Map<string, number>();
  for (const r of rows) {
    const code = dRows.find((d) => d.id === r.domainId)?.code ?? "?";
    byDomain.set(code, (byDomain.get(code) ?? 0) + 1);
  }
  const dist = ["D1", "D2", "D3", "D4", "D5"].map((c) => `${c}:${byDomain.get(c) ?? 0}`).join("  ");
  const ms = rows.filter((r) => r.multiSelect).length;
  console.log(`Distribution → ${dist}   (multi-select: ${ms}/${rows.length})`);

  if (args.dryRun) {
    console.log("[dry-run] no rows written.");
    return;
  }
  for (let i = 0; i < rows.length; i += 100) {
    await db.insert(questions).values(rows.slice(i, i + 100));
  }
  console.log(`Inserted ${rows.length} questions.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
