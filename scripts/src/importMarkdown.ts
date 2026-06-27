/**
 * Import Snagit OCR transcripts (.md, captured from .snagx screen recordings)
 * into the app as Notes inside a single Notebook.
 *
 * For each `<name>.md` it:
 *   1. (default) runs the text through Claude to repair OCR errors and
 *      reformat as clean Markdown — large files are cleaned in chunks;
 *   2. inserts a Note whose `sourceUrl` records the original `<name>.snagx`
 *      so every source is traceable back to its recording.
 *
 * Idempotent: re-running skips any `.snagx` already imported into the notebook,
 * so it is safe after a partial run or to pick up newly-added captures.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx ./src/importMarkdown.ts [dir] [flags]
 *
 *   dir                directory of .md files (default: repo root)
 *   --notebook "Name"  target notebook title (default: "Snagit Study Captures")
 *   --split            route each capture to a per-PA8-domain notebook (D1–D5)
 *   --concurrency N    clean/import N files in parallel (default 1)
 *   --raw              skip AI cleanup, import the OCR text as-is
 *   --dry-run          report what would happen, write nothing
 *   --force            re-import even if the .snagx is already a source
 *
 * Requires: DATABASE_URL, and (unless --raw) AI_INTEGRATIONS_ANTHROPIC_* env vars.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { db, notebooks, notes } from "@workspace/db";
import { eq } from "drizzle-orm";
import { anthropic } from "@workspace/integrations-anthropic-ai";

// Mechanical OCR repair — a cheaper tier (e.g. "claude-haiku-4-5") cuts cost
// substantially across many files if you'd rather not run it on Opus.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 16_000; // headroom for a cleaned chunk; non-streaming-safe
const CHUNK_CHARS = 8000; // ~paragraph-batched cleanup unit, keeps output bounded
const MAX_NOTE_CHARS = 200_000; // mirrors the /import endpoint cap

// Repo root holds the .md files; this script lives at scripts/src/.
const REPO_ROOT = path.resolve(import.meta.dirname, "..", "..");
// Repo docs that happen to be .md but are not study captures.
const SKIP_FILES = new Set(["CLAUDE.md", "README.md", "replit.md"]);

type Args = {
  dir: string;
  notebookTitle: string;
  clean: boolean;
  dryRun: boolean;
  force: boolean;
  concurrency: number;
  split: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dir: REPO_ROOT,
    notebookTitle: "Snagit Study Captures",
    clean: true,
    dryRun: false,
    force: false,
    concurrency: 1,
    split: false,
  };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--") continue; // pnpm forwards a bare separator
    else if (a === "--raw") args.clean = false;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--force") args.force = true;
    else if (a === "--split") args.split = true; // route each capture to a per-PA8-domain notebook
    else if (a === "--concurrency") args.concurrency = Math.max(1, Number(rest[++i]) || 1);
    else if (a === "--notebook") args.notebookTitle = rest[++i] ?? args.notebookTitle;
    else if (!a.startsWith("--")) args.dir = path.resolve(a);
    else throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

/** Run async tasks with a fixed concurrency cap, preserving input order. */
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

// PA8 domains for --split routing (each capture lands in its best-fit domain notebook).
const PA8_DOMAINS: { code: string; name: string }[] = [
  { code: "D1", name: "Risk Reduction, Wellness & Health Literacy" },
  { code: "D2", name: "Assessment, Evaluation & Diagnosis" },
  { code: "D3", name: "Critical Incident Management" },
  { code: "D4", name: "Therapeutic Intervention" },
  { code: "D5", name: "Healthcare Administration & Professional Responsibility" },
];

async function classifyDomain(text: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16,
    system:
      "You tag Athletic Training (BOC) study material to ONE PA8 exam domain. " +
      "D1=Risk Reduction/Wellness/Health Literacy; D2=Assessment/Evaluation/Diagnosis; " +
      "D3=Critical Incident Management (emergencies); D4=Therapeutic Intervention (rehab/modalities); " +
      "D5=Healthcare Administration & Professional Responsibility. Reply with ONLY the code (D1–D5).",
    messages: [{ role: "user", content: text.slice(0, 6000) }],
  });
  const out = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
  const m = out.match(/D[1-5]/);
  return m ? m[0] : "D2";
}

/** Split on blank lines, then batch paragraphs up to CHUNK_CHARS. */
function chunk(text: string): string[] {
  const paras = text.split(/\n{2,}/);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length + 2 > CHUNK_CHARS) {
      chunks.push(buf);
      buf = "";
    }
    buf = buf ? `${buf}\n\n${p}` : p;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function stripFences(s: string): string {
  const m = s.match(/^```(?:markdown|md)?\n([\s\S]*?)\n```\s*$/);
  return (m ? m[1] : s).trim();
}

const SYSTEM_PROMPT =
  "You repair OCR text captured from Athletic Training study materials " +
  "(textbook pages and lecture slides). Fix obvious OCR errors (e.g. " +
  "'Extensior'->'Extension', 'Flexior'->'Flexion', 'Hio'->'Hip', " +
  "'loe'->'Toe'), repair broken words and spacing, and format the result as " +
  "clean, readable Markdown (headings, lists, tables where appropriate). " +
  "Preserve ALL original meaning and content — never summarize, invent, or " +
  "drop information. Output only the corrected Markdown, with no preamble, " +
  "explanation, or code fences.";

async function cleanChunk(text: string): Promise<string> {
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: text }],
  });
  const out = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return stripFences(out || text);
}

async function cleanDocument(text: string, label: string): Promise<string> {
  const chunks = chunk(text);
  if (chunks.length === 1) return cleanChunk(chunks[0]);
  const out: string[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    process.stdout.write(`    cleaning chunk ${i + 1}/${chunks.length} of ${label}\r`);
    out.push(await cleanChunk(chunks[i]));
  }
  process.stdout.write("\n");
  return out.join("\n\n");
}

/** First meaningful line → note title, capped; fallback to the filename. */
function deriveTitle(content: string, fallback: string): string {
  const line = content
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .find((l) => l.length > 0);
  if (!line) return fallback;
  return line.length > 90 ? `${line.slice(0, 87)}…` : line;
}

async function main() {
  const args = parseArgs(process.argv);
  console.log(
    `Importing .md from ${args.dir}\n  notebook: "${args.notebookTitle}"  ` +
      `cleanup: ${args.clean ? "on" : "off (--raw)"}${args.dryRun ? "  [dry-run]" : ""}`,
  );

  const all = await readdir(args.dir);
  const mdFiles = all.filter((f) => f.toLowerCase().endsWith(".md") && !SKIP_FILES.has(f)).sort();
  if (mdFiles.length === 0) {
    console.log("No .md files to import.");
    return;
  }
  console.log(`Found ${mdFiles.length} markdown file(s).`);

  // Find or create the target notebook (idempotent on title).
  // Resolve target notebook(s) up front (so the concurrent pool never races on
  // notebook creation). Returns a resolver: cleaned content → notebook id.
  const notebookIds = new Set<number>();
  let pickNotebook: (domainCode: string) => number;

  if (args.split) {
    // One notebook per PA8 domain — captures land in their best-fit domain.
    const byCode = new Map<string, number>();
    for (const d of PA8_DOMAINS) {
      const title = `BOC Captures — ${d.code} ${d.name}`;
      let [nb] = await db.select().from(notebooks).where(eq(notebooks.title, title));
      if (!nb) {
        if (args.dryRun) continue;
        [nb] = await db
          .insert(notebooks)
          .values({ title, description: `Snagit OCR captures for PA8 ${d.name}` })
          .returning();
      }
      if (nb) { byCode.set(d.code, nb.id); notebookIds.add(nb.id); }
    }
    pickNotebook = (code) => byCode.get(code) ?? byCode.get("D2")!;
    console.log(`Split mode: routing to ${byCode.size} per-domain notebooks.`);
  } else {
    let [nb] = await db.select().from(notebooks).where(eq(notebooks.title, args.notebookTitle));
    if (!nb && !args.dryRun) {
      [nb] = await db
        .insert(notebooks)
        .values({ title: args.notebookTitle, description: "Imported Snagit OCR study captures" })
        .returning();
      console.log(`Created notebook #${nb.id}.`);
    } else if (nb) {
      console.log(`Using existing notebook #${nb.id}.`);
    }
    if (nb) notebookIds.add(nb.id);
    pickNotebook = () => nb!.id;
  }

  // Existing sources across all target notebooks → skip set (keyed by .snagx).
  const existing = new Set(
    notebookIds.size
      ? (await db.select({ sourceUrl: notes.sourceUrl }).from(notes))
          .map((r) => r.sourceUrl)
          .filter((u): u is string => !!u)
      : [],
  );

  let imported = 0;
  let skipped = 0;
  await pool(mdFiles, args.concurrency, async (file) => {
    const snagx = file.replace(/\.md$/i, ".snagx");
    if (!args.force && existing.has(snagx)) { skipped += 1; return; }

    const raw = (await readFile(path.join(args.dir, file), "utf8")).trim();
    if (!raw) { console.log(`  skip ${file} (empty)`); skipped += 1; return; }

    let content = args.clean ? await cleanDocument(raw, file) : raw;
    content = content.slice(0, MAX_NOTE_CHARS).trim();
    const title = deriveTitle(content, snagx);
    const domainCode = args.split ? await classifyDomain(content) : "";

    if (args.dryRun) {
      console.log(`  would import ${file} → "${title}" (${content.length} chars${args.split ? `, ${domainCode}` : ""})`);
      imported += 1;
      return;
    }

    await db.insert(notes).values({
      notebookId: pickNotebook(domainCode),
      title,
      content,
      sourceKind: "snagit",
      sourceUrl: snagx,
    });
    existing.add(snagx);
    imported += 1;
    console.log(`  imported ${file} → "${title}"${args.split ? ` [${domainCode}]` : ""}`);
  });

  if (!args.dryRun && imported > 0 && notebookIds.size) {
    for (const id of notebookIds) {
      await db.update(notebooks).set({ updatedAt: new Date() }).where(eq(notebooks.id, id));
    }
  }
  console.log(`Done. Imported ${imported}, skipped ${skipped}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
