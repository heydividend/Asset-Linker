/**
 * Import a front/back flashcard deck (JSON) into the `flashcards` table — for
 * recall-style study material (e.g. the Docsity BOC Q&A export), which is
 * term→definition pairs with no answer choices and therefore belongs in the
 * spaced-repetition deck, not the multiple-choice question bank.
 *
 * Cards are created in a dedicated notebook so they review together and never
 * mix with your generated/imported notes. Topic tagging is intentionally left to
 * the existing `backfill-flashcard-topics` script (run it afterward to AI-tag any
 * untagged cards), so this importer needs only DATABASE_URL — no AI calls.
 *
 * Input JSON: an array of { "front": "...", "back": "..." }.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx ./src/importFlashcards.ts [files...] [flags]
 *
 *   files...           one or more flashcard JSON files (default: every *.json in scripts/data/flashcards/)
 *   --notebook "Name"  target notebook title (default: "BOC Recall — Imported Q&A")
 *   --source S         flashcard source label (default: "import")
 *   --dry-run          report what would happen, write nothing
 *
 * Requires: DATABASE_URL.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { db, notebooks, flashcards } from "@workspace/db";
import { eq } from "drizzle-orm";

const DATA_DIR = path.resolve(import.meta.dirname, "..", "data", "flashcards");

type RawCard = { front?: string; back?: string };
type Args = { files: string[]; notebookTitle: string; source: string; dryRun: boolean };

function parseArgs(argv: string[]): Args {
  const args: Args = { files: [], notebookTitle: "BOC Recall — Imported Q&A", source: "import", dryRun: false };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--") continue;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--notebook") args.notebookTitle = rest[++i] ?? args.notebookTitle;
    else if (a === "--source") args.source = rest[++i] ?? args.source;
    else if (!a.startsWith("--")) args.files.push(path.resolve(a));
    else throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

async function main() {
  const args = parseArgs(process.argv);

  let files = args.files;
  if (files.length === 0) {
    const entries = await readdir(DATA_DIR).catch(() => [] as string[]);
    files = entries.filter((f) => f.toLowerCase().endsWith(".json")).map((f) => path.join(DATA_DIR, f)).sort();
  }
  if (files.length === 0) {
    console.log(`No flashcard files found (looked in ${DATA_DIR}).`);
    return;
  }

  // Load + validate raw cards.
  const cards: { front: string; back: string }[] = [];
  let skippedBad = 0;
  for (const f of files) {
    const parsed = JSON.parse(await readFile(f, "utf8")) as RawCard[];
    for (const c of parsed) {
      const front = (c.front ?? "").trim();
      const back = (c.back ?? "").trim();
      if (front.length >= 3 && back.length >= 1) cards.push({ front, back });
      else skippedBad += 1;
    }
    console.log(`Loaded ${parsed.length} from ${path.basename(f)}`);
  }

  // Find or create the target notebook.
  let [nb] = await db.select().from(notebooks).where(eq(notebooks.title, args.notebookTitle));
  if (!nb && !args.dryRun) {
    [nb] = await db
      .insert(notebooks)
      .values({ title: args.notebookTitle, description: "Imported flashcard recall deck" })
      .returning();
    console.log(`Created notebook #${nb.id}.`);
  } else if (nb) {
    console.log(`Using existing notebook #${nb.id}.`);
  }

  // Dedup against existing cards in this notebook + within this batch.
  const seen = new Set(
    nb
      ? (await db.select({ front: flashcards.front }).from(flashcards).where(eq(flashcards.notebookId, nb.id))).map((r) => normalize(r.front))
      : [],
  );
  const rows: { notebookId: number; front: string; back: string; source: string }[] = [];
  let skippedDup = 0;
  for (const c of cards) {
    const key = normalize(c.front);
    if (seen.has(key)) { skippedDup += 1; continue; }
    seen.add(key);
    if (nb) rows.push({ notebookId: nb.id, front: c.front, back: c.back, source: args.source });
  }

  console.log(`${rows.length} to import (${skippedDup} dup, ${skippedBad} unparseable).`);
  if (args.dryRun) {
    for (const r of rows.slice(0, 3)) console.log(`  • ${r.front.slice(0, 70)} → ${r.back.slice(0, 50)}`);
    console.log("[dry-run] no rows written.");
    return;
  }
  if (!nb || rows.length === 0) { console.log("Nothing to insert."); return; }

  for (let i = 0; i < rows.length; i += 200) await db.insert(flashcards).values(rows.slice(i, i + 200));
  await db.update(notebooks).set({ updatedAt: new Date() }).where(eq(notebooks.id, nb.id));
  console.log(`Inserted ${rows.length} flashcards. Run 'backfill-flashcard-topics' to tag them by topic.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
