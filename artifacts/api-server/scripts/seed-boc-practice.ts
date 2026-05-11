/**
 * One-shot ingestion of the official BOC practice question + rationale set
 * supplied by the user. Parses both attached files, matches Q<->A by number,
 * inserts each into the `questions` table tagged with sourceKind="boc_practice"
 * (so a re-run can be made idempotent), and also seeds a notebook with the
 * Q+A pairs so the AI Tutor can pull rationale context when explaining.
 *
 * Run:  pnpm --filter @workspace/api-server exec tsx scripts/seed-boc-practice.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { eq, and } from "drizzle-orm";
import {
  db,
  domains,
  topics,
  notebooks,
  notes,
  questions,
} from "@workspace/db";

const ROOT = path.resolve(process.cwd(), "../..");
const QUESTIONS_FILE = path.join(
  ROOT,
  "attached_assets/Pasted-1-Which-of-the-following-are-considered-roles-and-respo_1778537355751.txt",
);
const ANSWERS_FILE = path.join(
  ROOT,
  "attached_assets/Pasted-1-A-C-D-The-Board-of-Certification-BOC-for-athletic-tra_1778537379008.txt",
);

type ParsedQ = {
  n: number;
  stem: string;
  choices: string[];
  multiSelect: boolean;
  vignette?: string;
};
type ParsedA = { n: number; letters: string[]; rationale: string };

function parseQuestions(text: string): Map<number, ParsedQ> {
  const out = new Map<number, ParsedQ>();
  const lines = text.split("\n");
  let cur: ParsedQ | null = null;
  let pendingVignette: string | null = null;

  for (let raw of lines) {
    const line = raw.replace(/\r$/, "");
    const qMatch = line.match(/^(\d+)\.\s+(.*)$/);
    const cMatch = line.match(/^([a-h])\.\s+(.*)$/i);

    // Vignette intros like "Refer to the following for questions 14–18:"
    if (/^refer to the following/i.test(line.trim())) {
      pendingVignette = line.trim();
      // subsequent non-question lines accumulate into pendingVignette
      // until we hit a `^N\. ` line.
      cur = null;
      continue;
    }

    if (qMatch) {
      const n = parseInt(qMatch[1], 10);
      cur = {
        n,
        stem: qMatch[2].trim(),
        choices: [],
        multiSelect: /select all that apply/i.test(qMatch[2]),
      };
      if (pendingVignette) {
        cur.vignette = pendingVignette;
        // keep pendingVignette around so subsequent questions in the
        // 14-18 block also receive the same scenario context.
      }
      out.set(n, cur);
      continue;
    }

    if (cMatch && cur) {
      cur.choices.push(cMatch[2].trim());
      continue;
    }

    if (!cur) {
      // Either we're between Q's accumulating a vignette, or noise.
      if (pendingVignette && line.trim()) {
        pendingVignette += " " + line.trim();
      }
      continue;
    }

    if (line.trim()) {
      // Continuation of stem (no choices yet) or last choice.
      if (cur.choices.length === 0) {
        cur.stem += " " + line.trim();
        if (/select all that apply/i.test(line)) cur.multiSelect = true;
      } else {
        cur.choices[cur.choices.length - 1] += " " + line.trim();
      }
    }
  }

  // Trim every collected string.
  for (const q of out.values()) {
    q.stem = q.stem.replace(/\s+/g, " ").trim();
    q.choices = q.choices.map((c) => c.replace(/\s+/g, " ").trim());
    if (q.vignette) q.vignette = q.vignette.replace(/\s+/g, " ").trim();
  }
  return out;
}

function parseAnswers(text: string): Map<number, ParsedA> {
  const out = new Map<number, ParsedA>();
  const lines = text.split("\n");
  let cur: ParsedA | null = null;
  for (let raw of lines) {
    const line = raw.replace(/\r$/, "");
    // `1. A, C, D: rationale...` or `1. B: rationale`
    const m = line.match(/^(\d+)\.\s+([A-Z](?:,\s*[A-Z])*)\s*:\s*(.*)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      const letters = m[2].split(",").map((s) => s.trim().toUpperCase());
      cur = { n, letters, rationale: m[3].trim() };
      out.set(n, cur);
      continue;
    }
    if (cur) {
      if (line.trim()) cur.rationale += " " + line.trim();
    }
  }
  for (const a of out.values()) {
    a.rationale = a.rationale.replace(/\s+/g, " ").trim();
  }
  return out;
}

// Domain heuristics — keyword -> domain code.
function classifyDomain(stem: string, rationale: string): "D1" | "D2" | "D3" | "D4" | "D5" {
  const text = (stem + " " + rationale).toLowerCase();

  // D3 — Critical Incident (most specific, check first)
  if (
    /\b(aed|cpr|unconscious|unresponsive|airway|anaphyla|heat ?stroke|spine ?board|spinal cord injur|cervical spine|c-spine|naloxone|narcan|heimlich|chok|hemorrhage|tourniquet|laceration[, ]|primary survey|emergency|911|cardiac arrest|protruding|shock|frostbite|epistaxis)\b/.test(
      text,
    )
  ) {
    return "D3";
  }

  // D5 — Healthcare admin / professional responsibility
  if (
    /\b(hipaa|ferpa|osha|ncaa|boc|board of certification|soap|documentation|scope of practice|budget|operational cost|operating budget|emergency action plan|eap|evidence-based|regulatory|licensure|professional standards|jcaho|carf|medical record|continuing education|disciplinary|certification exam)\b/.test(
      text,
    )
  ) {
    return "D5";
  }

  // D2 — Assessment / evaluation / diagnosis
  if (
    /\b(special test|drawer test|cozen|thomas test|trendelenburg|sulcus|jerk test|palpat|hops format|history|observation|range of motion test|special tests|x-?ray|mri|spirometry|peak flow|glucometer|diagnos|differential|landing error scoring|tuck jump test|hopkins|t-score|bone density|sit-and-reach|harvard step|edgren|cooper agility|vertical jump|rockport|swelling.*observ|signs and symptoms|lateral epicondyl)\b/.test(
      text,
    )
  ) {
    return "D2";
  }

  // D1 — Risk reduction / wellness / health literacy
  if (
    /\b(prevent|nutrition|hydrat|supplement|protein|calcium|vitamin|hypoglyc|diabetes|alcohol|steroid|caffein|ephedrine|female triad|eating disorder|anorexia|amenorrhea|footwear|protective equipment|fit|measurement|warm-up|warm up|pre-game meal|pre-event nutrition|circadian|reliability|preseason|pre-participation|body composition|skinfold|underwater weighing|bioelectrical|body mass index|bmi|cleaning|disinfect|infection|vaccination|hepatitis|bloodborne|asthma)\b/.test(
      text,
    )
  ) {
    return "D1";
  }

  // D4 — Therapeutic intervention (default for rehab/exercise/modality content)
  return "D4";
}

// Topic name (must already exist in the topics table from the main seed).
function classifyTopic(domain: string, stem: string, rationale: string): string {
  const text = (stem + " " + rationale).toLowerCase();

  if (domain === "D3") {
    if (/\bheat|wbgt|cooling|cold-water immersion|cwi\b/.test(text)) return "Heat Illness";
    if (/\bc-?spine|cervical spine|spine ?board|logroll|helmet|shoulder pad/.test(text)) return "Spinal Injury Management";
    return "Cardiopulmonary Emergencies";
  }
  if (domain === "D5") {
    if (/\bsoap|documentation|medical record|hipaa|ferpa\b/.test(text)) return "Documentation & SOAP Notes";
    if (/\bemergency action plan|eap\b/.test(text)) return "Emergency Action Plans";
    return "Professional Standards";
  }
  if (domain === "D2") {
    if (/\bconcussion|scat|voms|second impact\b/.test(text)) return "Concussion Assessment";
    if (/\bspine|lumbar|cervical|disc|herniat|spondyl|sciatica|low back\b/.test(text)) return "Spine Evaluation";
    if (/\bshoulder|elbow|wrist|biceps|rotator|clavicle|cozen|valgus|sulcus|drawer.*shoulder|jerk test|carpal|de quervain|epicondyl|thoracic outlet\b/.test(text)) {
      return "Upper Extremity Special Tests";
    }
    return "Lower Extremity Special Tests";
  }
  if (domain === "D1") {
    if (/\bnutrition|protein|calcium|vitamin|hydrat|supplement|caffeine|ephedrine|hypoglyc|diabetes|pre-game|pre-event|alcohol|steroid|weight gain\b/.test(text)) {
      return "Nutrition & Hydration";
    }
    if (/\bheat|cold|wbgt|altitude|environment|lightning\b/.test(text)) return "Environmental Conditions";
    if (/\bequipment|footwear|fit|measurement|brace|tape|shoulder pad|helmet|protective\b/.test(text)) return "Protective Equipment";
    if (/\beating disorder|female triad|amenorrhea|anorexia|mental health|depression|anxiety|psychosocial|cognitive restructuring|self-talk\b/.test(text)) {
      return "Mental Health Screening";
    }
    return "Nutrition & Hydration";
  }
  // D4
  if (/\bultrasound|cryotherapy|electrical stim|e-stim|whirlpool|heat pack|massage|foam roller|graston|myofascial|laser|led|light therapy|modality|thermo\b/.test(text)) {
    return "Therapeutic Modalities";
  }
  if (/\bjoint mobil|manual therapy|grade [1-5] mobil|glide|traction|distraction\b/.test(text)) {
    return "Manual Therapy";
  }
  if (/\bnsaid|aspirin|ibuprofen|naloxone|narcan|insulin|glucagon|analges|pharmacolog|medication|antibiotic\b/.test(text)) {
    return "Pharmacology";
  }
  return "Therapeutic Exercise";
}

function letterToIndex(l: string): number {
  return l.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
}

async function main() {
  console.log("Reading attached files…");
  const qText = readFileSync(QUESTIONS_FILE, "utf8");
  const aText = readFileSync(ANSWERS_FILE, "utf8");
  const Qs = parseQuestions(qText);
  const As = parseAnswers(aText);
  console.log(`  parsed ${Qs.size} questions and ${As.size} answers`);

  // Pull domain + topic ids
  const dRows = await db.select().from(domains);
  if (dRows.length === 0) {
    throw new Error("No domains found — run the main seed first (pnpm --filter @workspace/api-server exec tsx src/seed.ts).");
  }
  const D = Object.fromEntries(dRows.map((d) => [d.code, d.id])) as Record<string, number>;
  const tRows = await db.select().from(topics);
  const T = Object.fromEntries(tRows.map((t) => [t.name, t.id])) as Record<string, number>;

  // Idempotency: drop previously-seeded boc_practice questions and notebook
  console.log("Removing any prior boc_practice questions / notebook…");
  await db.delete(questions).where(eq(questions.sourceKind, "boc_practice"));
  const existingNb = await db
    .select()
    .from(notebooks)
    .where(eq(notebooks.title, "BOC Official Practice Q&A (175)"));
  for (const nb of existingNb) {
    await db.delete(notebooks).where(eq(notebooks.id, nb.id));
  }

  // Build the question rows
  const skipped: number[] = [];
  const rows: typeof questions.$inferInsert[] = [];
  const noteRows: typeof notes.$inferInsert[] = [];

  // Create the reference notebook first
  const [nb] = await db
    .insert(notebooks)
    .values({
      title: "BOC Official Practice Q&A (175)",
      description: "Official BOC-style practice questions with full rationales — the reference set the AI Tutor pulls from when you ask 'why is the answer X'. Sourced from your attached practice exam.",
    })
    .returning();

  for (let n = 1; n <= 175; n++) {
    const q = Qs.get(n);
    const a = As.get(n);
    if (!q || !a) {
      skipped.push(n);
      continue;
    }
    if (q.choices.length === 0) {
      skipped.push(n);
      continue;
    }

    const indices = a.letters
      .map((l) => letterToIndex(l))
      .filter((i) => i >= 0 && i < q.choices.length);
    if (indices.length === 0) {
      skipped.push(n);
      continue;
    }

    const isMulti = q.multiSelect || indices.length > 1;
    const domain = classifyDomain(q.stem, a.rationale);
    const topicName = classifyTopic(domain, q.stem, a.rationale);
    const topicId = T[topicName];
    if (!topicId) {
      console.warn(`  Q${n}: topic "${topicName}" missing — skipping`);
      skipped.push(n);
      continue;
    }

    const fullStem = q.vignette ? `${q.vignette}\n\n${q.stem}` : q.stem;

    rows.push({
      stem: fullStem,
      choices: q.choices,
      correctIndex: indices[0],
      multiSelect: isMulti,
      correctIndices: isMulti ? indices : null,
      rationale: a.rationale,
      domainId: D[domain],
      topicId,
      difficulty: 3,
      sourceKind: "boc_practice",
      sourceUrl: null,
      enabled: true,
      pendingReview: false,
    });

    // Notebook note for AI Tutor reference. One note per question keeps
    // each item retrievable and focused for the chat panel.
    const letterList = a.letters.join(", ");
    const choiceLines = q.choices
      .map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`)
      .join("\n");
    noteRows.push({
      notebookId: nb.id,
      title: `Q${n}: ${q.stem.slice(0, 80)}${q.stem.length > 80 ? "…" : ""}`,
      content: [
        q.vignette ? `Scenario: ${q.vignette}\n` : "",
        `Question: ${q.stem}`,
        "",
        choiceLines,
        "",
        `Correct: ${letterList}${isMulti ? "  (Select all that apply)" : ""}`,
        "",
        `Rationale: ${a.rationale}`,
      ].join("\n"),
      sourceKind: "paste",
    });
  }

  console.log(`Inserting ${rows.length} questions and ${noteRows.length} notes…`);
  // Chunk inserts to keep parameter count reasonable.
  const chunk = <T>(arr: T[], n: number) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));
  for (const c of chunk(rows, 50)) await db.insert(questions).values(c);
  for (const c of chunk(noteRows, 50)) await db.insert(notes).values(c);

  console.log(`✓ Done. Inserted ${rows.length} questions + ${noteRows.length} notes.`);
  if (skipped.length) {
    console.log(`  skipped Q#: ${skipped.join(", ")}`);
  }

  // Quick domain breakdown
  const breakdown = rows.reduce<Record<number, number>>((acc, r) => {
    acc[r.domainId!] = (acc[r.domainId!] ?? 0) + 1;
    return acc;
  }, {});
  for (const d of dRows) {
    console.log(`  ${d.code} (${d.name}): ${breakdown[d.id] ?? 0}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
