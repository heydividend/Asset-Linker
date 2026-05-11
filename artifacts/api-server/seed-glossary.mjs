import { db, notebooks, notes } from "@workspace/db";
import { eq } from "drizzle-orm";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const text = fs.readFileSync(path.join(__dirname, "src/lib/bocGlossary.ts"), "utf8")
  .replace(/^[\s\S]*?export const BOC_GLOSSARY = `\n?/, "")
  .replace(/`;\s*$/, "")
  .replace(/\\`/g, "`")
  .replace(/\\\$\{/g, "${");

const TITLE = "BOC Glossary (Reference)";
const NB_TITLE = "Reference Library";

let [nb] = await db.select().from(notebooks).where(eq(notebooks.title, NB_TITLE));
if (!nb) {
  [nb] = await db.insert(notebooks).values({ title: NB_TITLE, description: "Reference materials the AI tutor uses as ground truth." }).returning();
  console.log("created notebook", nb.id);
}

const existing = await db.select().from(notes).where(eq(notes.title, TITLE));
if (existing.length) {
  for (const n of existing) await db.delete(notes).where(eq(notes.id, n.id));
}
const [created] = await db.insert(notes).values({
  notebookId: nb.id,
  title: TITLE,
  content: text,
  sourceKind: "glossary",
}).returning();
console.log("inserted note", created.id, "len=", text.length);
process.exit(0);
