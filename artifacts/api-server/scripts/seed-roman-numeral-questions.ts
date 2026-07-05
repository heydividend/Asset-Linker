/**
 * Seeds a small set of BOC-style "Roman numeral combination" questions — the
 * format where the stem lists numbered statements (I, II, III, …) and each
 * lettered choice is a *combination* of those statements. These are ordinary
 * single-answer multiple-choice items (pick the one letter whose combination is
 * entirely correct), so they need no schema or engine changes.
 *
 * The stems embed the numbered list with newlines; the quiz + mock runners
 * render the stem with `whitespace-pre-line`, so each statement shows on its own
 * line.
 *
 * Idempotent: every run deletes prior rows tagged sourceKind="roman_numeral"
 * and re-inserts, so it is safe to re-run after editing the content below.
 *
 * Run:  pnpm --filter @workspace/api-server exec tsx scripts/seed-roman-numeral-questions.ts
 */
import { eq } from "drizzle-orm";
import { db, domains, topics, tasks, questions } from "@workspace/db";

type Authored = {
  stem: string;
  choices: string[];
  correctIndex: number;
  rationale: string;
  domain: "D1" | "D2" | "D3" | "D4" | "D5";
  topic: string;
  task: string; // PA8 task code, e.g. "0303"
  difficulty?: number;
};

// Helper to build a stem: a question followed by a numbered (Roman) list.
function stem(question: string, items: string[]): string {
  const romans = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
  const list = items.map((t, i) => `${romans[i]}. ${t}`).join("\n");
  return `${question}\n\n${list}`;
}

const AUTHORED: Authored[] = [
  {
    domain: "D3",
    topic: "Cardiopulmonary Emergencies",
    task: "0303",
    stem: stem(
      "Which of the measures below are appropriate steps in the management of an athlete who is experiencing a seizure?",
      [
        "Keep spectators away",
        "Protect the athlete's head and body from injury",
        "Turn the athlete on her side",
        "If the athlete is in status epilepticus or it is a first seizure, immediately seek further medical support",
        "Try to keep the athlete's mouth open by any means to prevent airway obstruction",
        "Call the athlete's next of kin to inform them of the problem and care given",
      ],
    ),
    choices: ["II, IV, V, VI", "I, II, III, IV", "II, III, IV, VI", "I, II, IV, V", "III, IV, V, VI"],
    correctIndex: 1,
    rationale:
      "Appropriate on-field seizure management is to keep spectators away (I), protect the head and body from injury (II), turn the athlete on their side once active convulsions subside to protect the airway (III), and activate EMS / seek further medical care for a first-time seizure or status epilepticus (IV). You must never force anything into the mouth (V) — it can fracture teeth, obstruct the airway, or injure the rescuer. Notifying next of kin (VI) is done afterward and is not one of the immediate management steps, so any option containing V or VI is incorrect. That leaves B (I, II, III, IV).",
    difficulty: 2,
  },
  {
    domain: "D3",
    topic: "Heat Illness",
    task: "0303",
    stem: stem(
      "An athlete collapses during a summer conditioning session with suspected exertional heat stroke. Which of the following are appropriate immediate management steps?",
      [
        "Remove excess clothing and equipment",
        "Obtain a rectal temperature to confirm core temperature",
        "Begin whole-body cold-water immersion",
        "Transport to the hospital immediately, then begin cooling en route",
        "Cool first, transport second",
      ],
    ),
    choices: ["I, III, IV", "II, III, V", "I, II, III, V", "I, II, IV", "III, IV, V"],
    correctIndex: 2,
    rationale:
      "For exertional heat stroke the standard of care is to remove equipment/clothing (I), confirm core temperature with a rectal thermometer (II) — oral, axillary, and tympanic readings are inaccurate during exercise — and aggressively cool via cold-water immersion (III) following the 'cool first, transport second' principle (V). Transporting before cooling (IV) delays the intervention most tied to survival, so any option with IV is wrong. The correct combination is C (I, II, III, V).",
    difficulty: 3,
  },
  {
    domain: "D2",
    topic: "Concussion Assessment",
    task: "0202",
    stem: stem(
      "During the sideline evaluation of a head-injured athlete, which of the following are 'red flag' findings that warrant immediate physician referral or EMS activation?",
      [
        "Deteriorating level of consciousness",
        "Repeated vomiting",
        "A brief headache that quickly resolves",
        "Seizure activity",
        "Increasing confusion or agitation",
      ],
    ),
    choices: ["I, III, IV", "II, III, V", "III, IV, V", "I, II, IV, V", "I, II, III, IV, V"],
    correctIndex: 3,
    rationale:
      "Red flags that mandate emergent referral include a deteriorating level of consciousness (I), repeated vomiting (II), any seizure activity (IV), and increasing confusion or agitation (V) — all signs of possible intracranial pathology. A single, brief headache that resolves (III) is a common concussion symptom but is not by itself an emergency red flag, so options containing III as a red flag are wrong. The correct combination is D (I, II, IV, V).",
    difficulty: 3,
  },
  {
    domain: "D5",
    topic: "Documentation & SOAP Notes",
    task: "0504",
    stem: stem(
      "Which of the following statements about the SOAP note format are correct?",
      [
        "The Subjective section includes the patient's reported symptoms and history",
        "The Objective section includes measurable findings such as range of motion and special test results",
        "The Assessment section contains the clinician's clinical impression or diagnosis",
        "The Plan section documents interventions, goals, and follow-up",
        "The Objective section is where the patient's self-reported pain rating is primarily recorded",
      ],
    ),
    choices: ["I, II, III, IV", "I, III, V", "II, IV, V", "I, II, IV, V", "I, II, III, IV, V"],
    correctIndex: 0,
    rationale:
      "In the SOAP format, Subjective captures what the patient reports (I), Objective captures measurable/observable data such as ROM and special tests (II), Assessment is the clinician's clinical impression/diagnosis (III), and Plan lists interventions, goals, and follow-up (IV). A patient's self-reported pain rating is subjective information, not an Objective entry, so V is incorrect — which rules out every option containing V. The correct combination is A (I, II, III, IV).",
    difficulty: 2,
  },
  {
    domain: "D1",
    topic: "Environmental Conditions",
    task: "0105",
    stem: stem(
      "Which of the following are appropriate lightning-safety guidelines for outdoor athletic events?",
      [
        "Use the flash-to-bang method and suspend activity when the count is 30 seconds or less",
        "Wait a minimum of 30 minutes after the last lightning or thunder before resuming",
        "A fully enclosed building or a hard-topped metal vehicle is a safe shelter",
        "An open-sided dugout or field shelter is an acceptable safe location",
        "It is safe to remain on metal bleachers as long as you crouch down",
      ],
    ),
    choices: ["I, III, IV", "II, III, V", "I, II, IV", "III, IV, V", "I, II, III"],
    correctIndex: 4,
    rationale:
      "Lightning-safety guidelines call for using the flash-to-bang count and suspending activity at 30 seconds or less (I), waiting at least 30 minutes after the last strike or thunder before returning (II), and sheltering in a fully enclosed building or hard-topped vehicle (III). Open-sided dugouts/shelters (IV) and metal bleachers (V) are NOT safe locations, so any option containing them is wrong. The correct combination is E (I, II, III).",
    difficulty: 2,
  },
  {
    domain: "D4",
    topic: "Therapeutic Modalities",
    task: "0404",
    stem: stem(
      "Which of the following are contraindications to the application of cold-based modalities such as an ice bath or cold whirlpool?",
      [
        "Raynaud's phenomenon",
        "Cold hypersensitivity (cold urticaria)",
        "An acute lateral ankle sprain within the first 48 hours",
        "Peripheral vascular disease or compromised local circulation",
        "Delayed-onset muscle soreness",
      ],
    ),
    choices: ["I, III, V", "I, II, IV", "II, III, IV", "I, II, III", "II, IV, V"],
    correctIndex: 1,
    rationale:
      "Cold modalities are contraindicated with Raynaud's phenomenon (I), cold hypersensitivity/cold urticaria (II), and peripheral vascular disease or otherwise compromised circulation (IV), because cold-induced vasoconstriction can cause tissue injury in these conditions. An acute ankle sprain (III) and DOMS (V) are common indications for cold, not contraindications, so options containing them are wrong. The correct combination is B (I, II, IV).",
    difficulty: 3,
  },
];

async function main() {
  const dRows = await db.select().from(domains);
  if (dRows.length === 0) {
    throw new Error(
      "No domains found — run the main seed first (pnpm --filter @workspace/api-server exec tsx src/seed.ts).",
    );
  }
  const D = Object.fromEntries(dRows.map((d) => [d.code, d.id])) as Record<string, number>;
  const tRows = await db.select().from(topics);
  const T = Object.fromEntries(tRows.map((t) => [t.name, t.id])) as Record<string, number>;
  const taskRows = await db.select().from(tasks);
  const K = Object.fromEntries(taskRows.map((t) => [t.code, t.id])) as Record<string, number>;

  // Idempotency: clear any previously-seeded roman_numeral questions.
  console.log("Removing any prior roman_numeral questions…");
  await db.delete(questions).where(eq(questions.sourceKind, "roman_numeral"));

  const rows: (typeof questions.$inferInsert)[] = [];
  for (const a of AUTHORED) {
    const domainId = D[a.domain];
    const topicId = T[a.topic];
    const taskId = K[a.task];
    if (!domainId) throw new Error(`Domain ${a.domain} not found`);
    if (!topicId) throw new Error(`Topic "${a.topic}" not found — check the topics seed`);
    if (!taskId) throw new Error(`Task ${a.task} not found — check the tasks seed`);
    rows.push({
      stem: a.stem,
      choices: a.choices,
      correctIndex: a.correctIndex,
      multiSelect: false,
      correctIndices: null,
      rationale: a.rationale,
      domainId,
      topicId,
      taskId,
      difficulty: a.difficulty ?? 2,
      sourceKind: "roman_numeral",
      sourceUrl: null,
      enabled: true,
      pendingReview: false,
    });
  }

  await db.insert(questions).values(rows);
  console.log(`✓ Inserted ${rows.length} roman-numeral questions.`);
  for (const d of dRows) {
    const count = rows.filter((r) => r.domainId === d.id).length;
    if (count > 0) console.log(`  ${d.code} (${d.name}): ${count}`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
