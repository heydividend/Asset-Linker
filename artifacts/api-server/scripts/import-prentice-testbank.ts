/**
 * One-shot ingestion of the Prentice "Principles of Athletic Training"
 * 18e test bank PDF (29 chapters, ~1100 questions). For each parsed Q&A
 * pair we:
 *   - insert a row into `questions` (sourceKind="prentice_test_bank")
 *     so it shows up in quizzes, weakness drills, and mock exams
 *   - append a chapter-level note to a dedicated notebook so the AI
 *     Tutor and study-guide generator can pull this content into
 *     summaries, Q&A guides, and "ask AI" answers
 *   - create a flashcard (front=stem, back=correct letter+rationale)
 *
 * The questions table is the single source of truth for the practice
 * quiz, weakness drills, the Body Map "Drill" buttons, and the mock
 * exam — once a question is tagged to a topic, every surface picks it
 * up automatically.
 *
 * Re-running the script wipes prior prentice_test_bank rows and the
 * notebook so it stays idempotent.
 *
 * Run:
 *   pnpm --filter @workspace/api-server exec tsx scripts/import-prentice-testbank.ts
 */
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import {
  db,
  domains,
  topics,
  notebooks,
  notes,
  questions,
  flashcards,
} from "@workspace/db";

const ROOT = path.resolve(process.cwd(), "../..");
const PDF_PATH = path.join(
  ROOT,
  "attached_assets/Stuvia-5433259-test-bank-for-principles-of-athletic-training-a_1778545965515.pdf",
);
const NOTEBOOK_TITLE = "Prentice Test Bank — Principles of Athletic Training (18e)";

// ---------------------------------------------------------------------------
// PDF -> text
// ---------------------------------------------------------------------------
// We shell out to poppler's `pdftotext` because the JS pdf-parse library
// silently drops large portions of this particular test bank (it returns
// only ~16k lines vs poppler's full ~21k, missing every question after
// chapter 1). Poppler is preinstalled on the Replit runtime image.
function extractPdfText(pdfPath: string): string {
  return execFileSync("pdftotext", [pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

// Strip recurring page-footer / watermark noise so it doesn't leak into
// stems or rationales.
const NOISE = [
  /stuvia\.com/i,
  /^downloaded by:/i,
  /distribution of this document is illegal/i,
  /marketplace to buy and sell/i,
  /want to earn \$/i,
  /extra per year/i,
  /^\s*test bank for\s*$/i,
  /^\s*principles of athletic training/i,
  /^\s*chapter 1-29 answers/i,
  /^\s*william prentice/i,
  /^\s*student name:/i,
  /^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/i,
];

// Inline patterns to strip from a single line (page-counter watermarks
// like "-- 21 of 507 --" sometimes get glued onto a choice).
const INLINE_NOISE = [/--\s*\d+\s+of\s+\d+\s*--/g];

function stripNoise(text: string): string {
  return text
    .split("\n")
    .filter((line) => !NOISE.some((rx) => rx.test(line)))
    .map((line) => INLINE_NOISE.reduce((s, rx) => s.replace(rx, " "), line))
    .join("\n");
}

// ---------------------------------------------------------------------------
// Chapter splitting
// ---------------------------------------------------------------------------
type Chapter = { num: number; questionsBlock: string; answersBlock: string };

function splitChapters(text: string): Chapter[] {
  // Layout for each chapter:
  //   <questions for chapter K>
  //   Answer Key
  //   Test name: chapter K
  //   <answers for chapter K>
  //   <questions for chapter K+1>
  //   Answer Key
  //   Test name: chapter K+1
  //   ...
  //
  // So each chapter K is bounded by:
  //   questions[K] = (prev "Test name" + 1 .. K-th "Answer Key" - 1)
  //   answers[K]   = (K-th "Test name" + 1 .. next "Answer Key" - 1, or EOF)
  const lines = text.split("\n");
  const answerKeyLines: number[] = [];
  const testNameLines: { line: number; chapter: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^Answer Key\s*$/i.test(lines[i])) answerKeyLines.push(i);
    const m = lines[i].match(/^Test name:\s*chapter\s+(\d+)\s*$/i);
    if (m) testNameLines.push({ line: i, chapter: parseInt(m[1], 10) });
  }
  if (answerKeyLines.length !== testNameLines.length) {
    console.warn(
      `Marker count mismatch: ${answerKeyLines.length} Answer Key vs ${testNameLines.length} Test name lines`,
    );
  }

  const chapters: Chapter[] = [];
  for (let i = 0; i < testNameLines.length; i++) {
    const tn = testNameLines[i];
    const ak = answerKeyLines[i]; // the Answer Key that precedes this Test name
    const prevTn = i === 0 ? -1 : testNameLines[i - 1].line;
    const nextAk = answerKeyLines[i + 1]; // the next chapter's Answer Key
    const qStart = prevTn + 1;
    const qEnd = ak; // exclusive
    const aStart = tn.line + 1;
    const aEnd = nextAk ?? lines.length; // exclusive
    chapters.push({
      num: tn.chapter,
      questionsBlock: lines.slice(qStart, qEnd).join("\n"),
      answersBlock: lines.slice(aStart, aEnd).join("\n"),
    });
  }
  return chapters;
}

// ---------------------------------------------------------------------------
// Question parser:  N) stem...   A) ...  B) ...
// ---------------------------------------------------------------------------
type ParsedQ = { n: number; stem: string; choices: string[]; multiSelect: boolean };

function parseQuestions(block: string): Map<number, ParsedQ> {
  // The block we receive may contain leading answer entries from the
  // previous chapter (since the layout is:  ch K answers → ch K+1
  // questions → Answer Key K+1). We detect answer entries by the fact
  // that the line is `^\d+\)\s+[A-H]$` or `^\d+\)\s+\[...\]$` and skip
  // any text following them until we hit a real question or a choice.
  const out = new Map<number, ParsedQ>();
  const lines = block.split("\n");
  let cur: ParsedQ | null = null;
  let inAnswerEntry = false;

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const ansSingle = /^(\d+)\)\s+[A-H]\s*$/.test(line);
    const ansBracket = /^(\d+)\)\s+\[[^\]]+\]\s*$/.test(line);
    // Match both "12) stem text..." AND bare "12)" (some chapters put
    // the stem on the next line).
    const qMatch = line.match(/^(\d+)\)\s*(.*)$/);
    const cMatch = line.match(/^\s*([A-H])\)\s+(.*)$/);

    if (ansSingle || ansBracket) {
      inAnswerEntry = true;
      cur = null;
      continue;
    }
    if (qMatch && !cMatch) {
      // Real question stem.
      inAnswerEntry = false;
      const n = parseInt(qMatch[1], 10);
      cur = {
        n,
        stem: qMatch[2].trim(),
        choices: [],
        multiSelect: /select all that apply/i.test(qMatch[2]),
      };
      out.set(n, cur);
      continue;
    }
    if (cMatch && cur) {
      cur.choices.push(cMatch[2].trim());
      inAnswerEntry = false;
      continue;
    }
    if (inAnswerEntry) continue; // skip rationale text from prior chapter
    if (!cur) continue;
    if (line.trim()) {
      if (cur.choices.length === 0) {
        cur.stem += " " + line.trim();
        if (/select all that apply/i.test(line)) cur.multiSelect = true;
      } else {
        cur.choices[cur.choices.length - 1] += " " + line.trim();
      }
    }
  }

  // Drop any "questions" that ended up with no choices — those are
  // typically misclassified noise.
  for (const [k, q] of [...out]) {
    if (q.choices.length === 0) out.delete(k);
  }
  for (const q of out.values()) {
    q.stem = q.stem.replace(/\s+/g, " ").trim();
    q.choices = q.choices.map((c) => c.replace(/\s+/g, " ").trim());
  }
  return out;
}

// ---------------------------------------------------------------------------
// Answer parser:  N) LETTER  or  N) [A, B, C]    then rationale text
// ---------------------------------------------------------------------------
type ParsedA = { n: number; letters: string[]; rationale: string };

function parseAnswers(block: string): Map<number, ParsedA> {
  // Answers come in three formats across the document:
  //   (a) "N) A"                                  inline single
  //   (b) "N) [A, B, F]"                          inline bracket
  //   (c) "N)" alone, blank, then "A" or "[A, B]" on their own lines
  //
  // Format (c) sometimes stacks several bare "N)" markers before the
  // matching letters appear, so we keep a FIFO of pending numbers and
  // pop them as letters arrive.
  //
  // The block trails into the next chapter's questions; once we see a
  // choice line ("A) ...") we abandon any in-progress answer.
  const out = new Map<number, ParsedA>();
  const lines = block.split("\n");
  let cur: ParsedA | null = null;
  const pending: number[] = [];

  const commit = (n: number, letters: string[]) => {
    cur = { n, letters, rationale: "" };
    out.set(n, cur);
  };

  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    const inlineSingle = line.match(/^(\d+)\)\s+([A-H])\s*$/);
    const inlineBracket = line.match(/^(\d+)\)\s+\[\s*([A-H](?:\s*,\s*[A-H])*)\s*\]\s*$/);
    const bareN = line.match(/^(\d+)\)\s*$/);
    const standaloneLetter = line.match(/^([A-H])\s*$/);
    const standaloneBracket = line.match(/^\[\s*([A-H](?:\s*,\s*[A-H])*)\s*\]\s*$/);
    const isChoice = /^\s*[A-H]\)\s+/.test(line);
    // A "N) <text>" line that isn't an inline answer = a question stem
    // (we've crossed into the next chapter's question block).
    const inlineQuestion =
      !inlineSingle && !inlineBracket && !bareN && /^\d+\)\s+\S/.test(line);

    if (inlineSingle) {
      commit(parseInt(inlineSingle[1], 10), [inlineSingle[2]]);
      pending.length = 0;
      continue;
    }
    if (inlineBracket) {
      const letters = inlineBracket[2].split(",").map((s) => s.trim().toUpperCase());
      commit(parseInt(inlineBracket[1], 10), letters);
      pending.length = 0;
      continue;
    }
    if (bareN) {
      pending.push(parseInt(bareN[1], 10));
      cur = null;
      continue;
    }
    if (standaloneLetter && pending.length > 0) {
      commit(pending.shift()!, [standaloneLetter[1]]);
      continue;
    }
    if (standaloneBracket && pending.length > 0) {
      const letters = standaloneBracket[1].split(",").map((s) => s.trim().toUpperCase());
      commit(pending.shift()!, letters);
      continue;
    }
    if (isChoice || inlineQuestion) {
      // Hit the next chapter's questions — stop accumulating rationale.
      cur = null;
      pending.length = 0;
      continue;
    }
    if (cur && line.trim()) {
      cur.rationale += (cur.rationale ? " " : "") + line.trim();
    }
  }

  for (const a of out.values()) a.rationale = a.rationale.replace(/\s+/g, " ").trim();
  return out;
}

// ---------------------------------------------------------------------------
// Domain / topic classification (mirrors seed-boc-practice.ts heuristics
// + a chapter hint, since Prentice chapters map cleanly to BOC domains).
// ---------------------------------------------------------------------------
type DomainCode = "D1" | "D2" | "D3" | "D4" | "D5";

// Chapter -> probable domain when keywords are ambiguous.
const CHAPTER_DOMAIN: Record<number, DomainCode> = {
  1: "D5", 2: "D5", 3: "D5",
  4: "D1", 5: "D1", 6: "D1",
  7: "D4",
  8: "D2", 9: "D4", 10: "D4", 11: "D2", 12: "D4", 13: "D4",
  14: "D1",
  15: "D3", 16: "D1",
  17: "D2", 18: "D2", 19: "D2", 20: "D2", 21: "D2", 22: "D2", 23: "D2", 24: "D2",
  25: "D2", 26: "D2",
  27: "D2", 28: "D2", 29: "D2",
};

function classifyDomain(chapter: number, stem: string, rationale: string): DomainCode {
  const text = (stem + " " + rationale).toLowerCase();
  // D3 — Critical Incident (highest priority, true emergencies)
  if (
    /\b(aed|cpr|unconscious|unresponsive|airway|anaphyla|heat ?stroke|spine ?board|spinal cord injur|cervical spine|c-spine|naloxone|narcan|heimlich|chok|hemorrhage|tourniquet|primary survey|emergency action plan|cardiac arrest|shock|epistaxis|second impact)\b/.test(
      text,
    )
  ) return "D3";
  // D5 — Healthcare admin / professional responsibility
  if (
    /\b(hipaa|ferpa|osha|ncaa|boc|board of certification|soap note|documentation|scope of practice|budget|operating budget|licensure|professional standards|medical record|continuing education|disciplinary|certification exam|caate|naata|ethic|code of ethics|policy|procedure manual|liability|negligence|standard of care)\b/.test(
      text,
    )
  ) return "D5";
  // D2 — Assessment / evaluation / diagnosis
  if (
    /\b(special test|drawer test|cozen|thomas test|trendelenburg|sulcus|jerk test|palpat|hops format|range of motion|x-?ray|mri|spirometry|peak flow|glucometer|diagnos|differential|landing error scoring|tuck jump|signs and symptoms|epicondyl|impingement|tinel|phalen|finkelstein|empty can|apprehension|talar tilt|mcmurray|lachman|valgus stress|varus stress|sign of)\b/.test(
      text,
    )
  ) return "D2";
  // D1 — Risk reduction / wellness / health literacy
  if (
    /\b(prevent|nutrition|hydrat|supplement|protein|calcium|vitamin|hypoglyc|diabetes|alcohol|steroid|caffein|ephedrine|female triad|eating disorder|anorexia|amenorrhea|footwear|protective equipment|warm-up|pre-game meal|circadian|preseason|pre-participation|body composition|bmi|cleaning|disinfect|infection|vaccination|hepatitis|bloodborne|asthma|psychosocial|mental health|stress management|relaxation)\b/.test(
      text,
    )
  ) return "D1";
  // D4 — Therapeutic intervention
  if (
    /\b(ultrasound|cryotherapy|electrical stim|e-stim|whirlpool|heat pack|massage|foam roller|graston|myofascial|laser|modality|nsaid|aspirin|ibuprofen|insulin|analges|pharmacolog|medication|joint mobil|manual therapy|grade [1-5] mobil|tape|tap(?:ing|e)|brace|rehabilitation|therapeutic exercise|strengthening|range of motion exercise|proprioception|plyometric)\b/.test(
      text,
    )
  ) return "D4";
  return CHAPTER_DOMAIN[chapter] ?? "D4";
}

function classifyTopic(domain: DomainCode, chapter: number, stem: string, rationale: string): string {
  const text = (stem + " " + rationale).toLowerCase();
  if (domain === "D3") {
    if (/\bheat|wbgt|cooling|cold-water immersion|cwi\b/.test(text)) return "Heat Illness";
    if (/\bc-?spine|cervical spine|spine ?board|logroll|helmet|shoulder pad/.test(text)) return "Spinal Injury Management";
    if (/\bemergency action plan|eap\b/.test(text)) return "Emergency Action Plans";
    return "Cardiopulmonary Emergencies";
  }
  if (domain === "D5") {
    if (/\bsoap|documentation|medical record|hipaa|ferpa\b/.test(text)) return "Documentation & SOAP Notes";
    if (/\bemergency action plan|eap\b/.test(text)) return "Emergency Action Plans";
    return "Professional Standards";
  }
  if (domain === "D2") {
    if (/\bconcussion|scat|voms|second impact|head injury|mild traumatic brain\b/.test(text) || chapter === 26) return "Concussion Assessment";
    if (/\bspine|lumbar|cervical|disc|herniat|spondyl|sciatica|low back|thoracic\b/.test(text) || chapter === 24) return "Spine Evaluation";
    if (
      /\bshoulder|elbow|wrist|biceps|rotator|clavicle|cozen|sulcus|drawer.*shoulder|jerk test|carpal|de quervain|epicondyl|thoracic outlet|forearm|hand|finger|thumb\b/.test(text) ||
      [21, 22, 23].includes(chapter)
    ) return "Upper Extremity Special Tests";
    if (
      /\bfoot|ankle|knee|hip|thigh|hamstring|quadriceps|patella|achilles|tibia|fibula|calf|toe|gastroc|popliteal|meniscus|acl|pcl|mcl|lcl\b/.test(text) ||
      [17, 18, 19, 20].includes(chapter)
    ) return "Lower Extremity Special Tests";
    return "Lower Extremity Special Tests";
  }
  if (domain === "D1") {
    if (/\bnutrition|protein|calcium|vitamin|hydrat|supplement|caffein|ephedrine|hypoglyc|diabetes|pre-game|pre-event|alcohol|steroid|weight gain|carbohydrate|electrolyte\b/.test(text) || chapter === 5) return "Nutrition & Hydration";
    if (/\bheat|cold|wbgt|altitude|environment|lightning|humid|air quality\b/.test(text)) return "Environmental Conditions";
    if (/\bequipment|footwear|fit|measurement|brace|tape|shoulder pad|helmet|protective|mouthguard|padding\b/.test(text) || chapter === 6) return "Protective Equipment";
    if (/\beating disorder|female triad|amenorrhea|anorexia|mental health|depression|anxiety|psychosocial|cognitive restructuring|self-talk|stress management|relaxation\b/.test(text) || chapter === 14) return "Mental Health Screening";
    if (/\bbloodborne|hepatitis|hiv|infection control|sterile|disinfect|vaccination|immuniz\b/.test(text) || chapter === 16) return "Bloodborne Pathogens";
    if (/\bfitness|conditioning|strength|cardiovascular|aerobic|anaerobic|periodization|warm-up|flexibility\b/.test(text) || chapter === 4) return "Fitness & Conditioning";
    return "Nutrition & Hydration";
  }
  // D4
  if (/\bultrasound|cryotherapy|electrical stim|e-stim|whirlpool|heat pack|massage|foam roller|graston|myofascial|laser|modality|thermo|tens|iontophoresis|paraffin\b/.test(text) || chapter === 12) return "Therapeutic Modalities";
  if (/\bjoint mobil|manual therapy|grade [1-5] mobil|glide|traction|distraction|mulligan\b/.test(text)) return "Manual Therapy";
  if (/\bnsaid|aspirin|ibuprofen|naloxone|narcan|insulin|glucagon|analges|pharmacolog|medication|antibiotic|epinephrine|albuterol|opioid|acetaminophen\b/.test(text) || chapter === 10) return "Pharmacology";
  if (/\btape|taping|wrap|bandag|brace\b/.test(text) || chapter === 7) return "Taping & Bandaging";
  if (/\binflammat|tissue heal|tissue response|repair|regenerat|scar|edema\b/.test(text) || chapter === 9) return "Tissue Healing";
  return "Therapeutic Exercise";
}

function letterToIndex(l: string): number {
  return l.toUpperCase().charCodeAt(0) - "A".charCodeAt(0);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
// Stem-prefix → image URL, populated from prentice-images.json (produced by
// extract-prentice-images.py from the DOCX). The PDF and DOCX use different
// chapter/qNum schemes (and many image-bearing questions are skipped by the
// PDF parser anyway), so we match by the first ~50 chars of the question
// stem instead — robust to whitespace and minor punctuation differences.
const imageByStem = new Map<string, string>();

function stemKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function loadImageMap() {
  const jsonPath = path.join(process.cwd(), "scripts/prentice-images.json");
  if (!existsSync(jsonPath)) {
    console.warn(`No image map found at ${jsonPath} — questions will be imported without figures.`);
    return;
  }
  const records = JSON.parse(readFileSync(jsonPath, "utf8")) as Array<{
    chapter: number;
    qNum: number;
    kind: "question" | "answer";
    stem: string;
    images: string[];
  }>;
  let count = 0;
  for (const r of records) {
    if (r.kind !== "question" || r.images.length === 0 || !r.stem) continue;
    const key = stemKey(r.stem);
    if (key.length < 12) continue; // too short to match safely
    imageByStem.set(key, `/games/prentice-images/${r.images[0]}`);
    count += 1;
  }
  console.log(`Loaded image map (${count} stem keys).`);
}

async function main() {
  console.log(`Reading ${PDF_PATH}…`);
  const rawText = extractPdfText(PDF_PATH);
  const text = stripNoise(rawText);
  const chapters = splitChapters(text);
  console.log(`Found ${chapters.length} chapters`);
  loadImageMap();

  const dRows = await db.select().from(domains);
  if (dRows.length === 0) throw new Error("No domains seeded — run src/seed.ts first.");
  const D = Object.fromEntries(dRows.map((d) => [d.code, d.id])) as Record<string, number>;
  const tRows = await db.select().from(topics);
  const T = Object.fromEntries(tRows.map((t) => [t.name, t.id])) as Record<string, number>;

  // Idempotency: drop prior rows from this source.
  console.log("Removing prior prentice_test_bank rows + notebook…");
  await db.delete(questions).where(eq(questions.sourceKind, "prentice_test_bank"));
  const existingNb = await db.select().from(notebooks).where(eq(notebooks.title, NOTEBOOK_TITLE));
  for (const nb of existingNb) await db.delete(notebooks).where(eq(notebooks.id, nb.id));

  const [nb] = await db
    .insert(notebooks)
    .values({
      title: NOTEBOOK_TITLE,
      description:
        "Imported from the Prentice 'Principles of Athletic Training' 18e test bank PDF. Each chapter is one note containing every Q&A with full rationale — the AI Tutor and study-guide generator will pull from these when you ask 'why is the answer X' or generate a Q&A study guide.",
    })
    .returning();

  const qRows: typeof questions.$inferInsert[] = [];
  const cRows: typeof flashcards.$inferInsert[] = [];
  const nRows: typeof notes.$inferInsert[] = [];
  const skipped: number[] = [];
  const domainCount: Record<string, number> = {};
  const topicCount: Record<string, number> = {};

  for (const ch of chapters) {
    const Qs = parseQuestions(ch.questionsBlock);
    const As = parseAnswers(ch.answersBlock);
    const noteParts: string[] = [`# Chapter ${ch.num}`, ""];

    const sortedNs = [...Qs.keys()].sort((a, b) => a - b);
    for (const n of sortedNs) {
      const q = Qs.get(n)!;
      const a = As.get(n);
      if (!a || q.choices.length === 0) {
        skipped.push(n);
        continue;
      }
      const indices = a.letters
        .map(letterToIndex)
        .filter((i) => i >= 0 && i < q.choices.length);
      if (indices.length === 0) {
        skipped.push(n);
        continue;
      }
      const isMulti = q.multiSelect || indices.length > 1;
      const dom = classifyDomain(ch.num, q.stem, a.rationale);
      const top = classifyTopic(dom, ch.num, q.stem, a.rationale);
      const tid = T[top];
      if (!tid) {
        skipped.push(n);
        continue;
      }
      domainCount[dom] = (domainCount[dom] ?? 0) + 1;
      topicCount[top] = (topicCount[top] ?? 0) + 1;

      const imageUrl = imageByStem.get(stemKey(q.stem)) ?? null;
      qRows.push({
        stem: q.stem,
        choices: q.choices,
        correctIndex: indices[0],
        multiSelect: isMulti,
        correctIndices: isMulti ? indices : null,
        rationale: a.rationale || "(no rationale provided in source)",
        domainId: D[dom],
        topicId: tid,
        difficulty: 3,
        sourceKind: "prentice_test_bank",
        sourceUrl: null,
        imageUrl,
        enabled: true,
        pendingReview: false,
      });

      const choiceLines = q.choices
        .map((c, i) => `${String.fromCharCode(65 + i)}. ${c}`)
        .join("\n");
      const correctLines = indices
        .map((i) => `${String.fromCharCode(65 + i)}. ${q.choices[i]}`)
        .join("\n");
      cRows.push({
        notebookId: nb.id,
        topicId: tid,
        front: q.stem,
        back: [
          `Correct: ${a.letters.join(", ")}${isMulti ? "  (Select all that apply)" : ""}`,
          "",
          correctLines,
          "",
          a.rationale ? `Why: ${a.rationale}` : "",
        ].filter(Boolean).join("\n"),
      });

      noteParts.push(
        `## Q${n}. ${q.stem}`,
        "",
        choiceLines,
        "",
        `**Correct: ${a.letters.join(", ")}**${isMulti ? "  _(select all that apply)_" : ""}`,
        "",
        a.rationale ? `${a.rationale}` : "",
        "",
      );
    }

    nRows.push({
      notebookId: nb.id,
      title: `Chapter ${ch.num} — Test Bank Q&A`,
      content: noteParts.join("\n"),
      sourceKind: "pdf",
    });
  }

  const withImage = qRows.filter((r) => r.imageUrl).length;
  console.log(`Inserting ${qRows.length} questions (${withImage} with images), ${cRows.length} flashcards, ${nRows.length} notes…`);
  const chunk = <T>(arr: T[], n: number) =>
    Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, (i + 1) * n));
  for (const c of chunk(qRows, 50)) await db.insert(questions).values(c);
  for (const c of chunk(cRows, 50)) await db.insert(flashcards).values(c);
  for (const c of chunk(nRows, 20)) await db.insert(notes).values(c);

  console.log(`✓ Done.`);
  console.log(`  Questions:  ${qRows.length}`);
  console.log(`  Flashcards: ${cRows.length}`);
  console.log(`  Notes:      ${nRows.length}`);
  console.log(`  Skipped Q#: ${skipped.length} (${skipped.slice(0, 20).join(", ")}${skipped.length > 20 ? "…" : ""})`);
  console.log("Domain breakdown:");
  for (const [d, n] of Object.entries(domainCount).sort()) {
    const dom = dRows.find((r) => r.code === d);
    console.log(`  ${d} (${dom?.name}): ${n}`);
  }
  console.log("Topic breakdown:");
  for (const [t, n] of Object.entries(topicCount).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t}: ${n}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
