import {
  db,
  domains,
  topics,
  tasks,
  notebooks,
  notes,
  questions,
  resources,
  examSchedule,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { PA8_DOMAIN_DESCRIPTIONS, PA8_TASKS } from "./lib/pa8Blueprint";

async function main() {
  console.log("Seeding…");

  await db.execute(sql`TRUNCATE
    domains, topics, tasks, task_mastery, notebooks, notes, flashcards, study_guides, audio_overviews,
    questions, quizzes, quiz_answers, mock_exams, topic_mastery, resources,
    scrape_jobs, conversations, messages, exam_schedule
    RESTART IDENTITY CASCADE`);

  // 1. Domains (BOC Practice Analysis 8th Edition — official blueprint weights
  //    + official domain descriptions from the PA8 content outline)
  const dRows = await db
    .insert(domains)
    .values([
      { code: "D1", name: "Risk Reduction, Wellness & Health Literacy", weight: 0.2, description: PA8_DOMAIN_DESCRIPTIONS.D1 },
      { code: "D2", name: "Assessment, Evaluation & Diagnosis", weight: 0.256, description: PA8_DOMAIN_DESCRIPTIONS.D2 },
      { code: "D3", name: "Critical Incident Management", weight: 0.208, description: PA8_DOMAIN_DESCRIPTIONS.D3 },
      { code: "D4", name: "Therapeutic Intervention", weight: 0.256, description: PA8_DOMAIN_DESCRIPTIONS.D4 },
      { code: "D5", name: "Healthcare Administration & Professional Responsibility", weight: 0.08, description: PA8_DOMAIN_DESCRIPTIONS.D5 },
    ])
    .returning();
  const D = Object.fromEntries(dRows.map((d) => [d.code, d.id])) as Record<string, number>;

  // 1b. Official PA8 task statements (the 23 sub-competencies the exam is built
  //     from). Each is tied to its domain; questions are tagged to these.
  const taskRows = await db
    .insert(tasks)
    .values(
      PA8_TASKS.map((t, i) => ({
        code: t.code,
        domainId: D[t.domain],
        statement: t.statement,
        sortOrder: i,
      })),
    )
    .returning();
  const TASK = Object.fromEntries(taskRows.map((t) => [t.code, t.id])) as Record<string, number>;

  // 2. Topics
  const tRows = await db
    .insert(topics)
    .values([
      { domainId: D.D1, name: "Environmental Conditions", description: "Heat, cold, lightning, air quality" },
      { domainId: D.D1, name: "Protective Equipment", description: "Selection, fit, removal" },
      { domainId: D.D1, name: "Nutrition & Hydration", description: "Macronutrients, supplements, RED-S" },
      { domainId: D.D1, name: "Mental Health Screening", description: "Depression, anxiety, eating disorders" },
      { domainId: D.D2, name: "Lower Extremity Special Tests", description: "Knee, ankle, hip" },
      { domainId: D.D2, name: "Upper Extremity Special Tests", description: "Shoulder, elbow, wrist" },
      { domainId: D.D2, name: "Concussion Assessment", description: "SCAT6, VOMS, balance testing" },
      { domainId: D.D2, name: "Spine Evaluation", description: "Cervical, thoracic, lumbar" },
      { domainId: D.D3, name: "Cardiopulmonary Emergencies", description: "Cardiac arrest, AED, anaphylaxis" },
      { domainId: D.D3, name: "Spinal Injury Management", description: "Spine board, equipment removal" },
      { domainId: D.D3, name: "Heat Illness", description: "Heat stroke, exhaustion, cold-water immersion" },
      { domainId: D.D4, name: "Therapeutic Modalities", description: "Cryotherapy, ultrasound, e-stim" },
      { domainId: D.D4, name: "Therapeutic Exercise", description: "Progression, neuromuscular re-ed" },
      { domainId: D.D4, name: "Manual Therapy", description: "Joint mobilization, soft tissue" },
      { domainId: D.D4, name: "Pharmacology", description: "NSAIDs, antibiotics, banned substances" },
      { domainId: D.D5, name: "Documentation & SOAP Notes", description: "EHR, HIPAA, FERPA" },
      { domainId: D.D5, name: "Emergency Action Plans", description: "EAP development, venue-specific" },
      { domainId: D.D5, name: "Professional Standards", description: "BOC standards, scope, ethics" },
    ])
    .returning();
  const T = Object.fromEntries(tRows.map((t) => [t.name, t.id])) as Record<string, number>;

  // 3. Schedule
  await db.insert(examSchedule).values({
    startDate: "2026-05-11",
    examDate: "2026-06-06",
    examName: "BOC Certification Exam",
  });

  // 4. Sample notebook seeded with key BOC handbook content + clinical reference
  const [nb] = await db
    .insert(notebooks)
    .values({
      title: "BOC Exam Handbook — Quick Reference",
      description: "Your starting notebook with key content from the official BOC Candidate Handbook and high-yield clinical reference notes. Generate flashcards, study guides, and an audio overview — and ask AI about anything inside.",
    })
    .returning();

  await db.insert(notes).values([
    {
      notebookId: nb.id,
      title: "BOC Exam Format Overview",
      content: `The BOC entry-level certification exam is a computer-based, multiple-choice exam developed by the Board of Certification for the Athletic Trainer.

KEY FACTS:
• Format: Computer-based, multiple-choice questions
• Time limit: ~4 hours (240 minutes)
• Passing standard: scaled score; informally interpreted as approximately 75% correct
• Five domains derived from the Practice Analysis 8th Edition
• Administered by Meazure Learning at testing centers in the US, Canada, UK, Ireland, Spain
• Government-issued photo ID required at check-in (original, valid, signed photo)
• Exam windows: candidates schedule a specific date inside a window
• Rescheduling: $45 within window (up to 2 business days before), $100 to a different window
• Cancellation: 50% refund if not yet scheduled, 25% if scheduled

EXAM SECURITY:
• No phones, smart watches, food, or notes inside the testing room
• Suspicious behavior is logged and may invalidate results
• Discussing exam content publicly violates the BOC Standards of Professional Practice`,
      sourceKind: "paste",
      sourceUrl: "https://bocatc.org/candidates",
    },
    {
      notebookId: nb.id,
      title: "Five BOC Domains (Practice Analysis 8th Edition)",
      content: `1) Risk Reduction, Wellness, and Health Literacy (20.0%)
   Prevention, education, environmental monitoring, protective equipment, nutrition, mental health screening, pre-participation exams.

2) Assessment, Evaluation, and Diagnosis (25.6%)
   History, observation, palpation, ROM, MMT, special tests, neurologic screening, imaging interpretation, differential diagnosis.

3) Critical Incident Management (20.8%)
   Cardiac emergencies, AED use, airway management, anaphylaxis, heat stroke (immediate cold-water immersion), cervical spine immobilization, hemorrhage control, on-field equipment removal.

4) Therapeutic Intervention (25.6%)
   Therapeutic modalities (thermal, electrical, mechanical), therapeutic exercise progression, manual therapy, neuromuscular re-education, return-to-play decision-making, pharmacology basics.

5) Healthcare Administration and Professional Responsibility (8.0%)
   Documentation (SOAP), HIPAA/FERPA, emergency action plans (EAP), risk management, BOC Standards of Professional Practice, billing, supervision, scope of practice.`,
      sourceKind: "paste",
    },
    {
      notebookId: nb.id,
      title: "High-Yield: Heat Illness Management",
      content: `EXERTIONAL HEAT STROKE is a true emergency.

DIAGNOSIS:
• Rectal temperature is the ONLY accurate field measure (>104°F / 40°C with CNS dysfunction)
• Oral, axillary, tympanic, and skin temperatures are NOT reliable

TREATMENT (cool first, transport second):
• COLD-WATER IMMERSION (CWI) is the gold standard — cool to <102°F before transport
• Target cooling rate: ~1°C every 3-5 minutes
• If CWI unavailable: tarp-assisted cooling, ice/wet towels rotating to head/neck/axilla/groin
• Continuous rectal temperature monitoring during cooling

PREVENTION:
• Heat acclimatization protocol (NATA position statement) — 14-day progressive build
• WBGT (wet-bulb globe temperature) monitoring drives activity modification
• Hydration: 17-20 oz 2-3 hours pre-activity; 7-10 oz every 10-20 min during

RED FLAGS for athlete: confusion, ataxia, collapse, seizure, hot dry or sweaty skin, rapid weak pulse.`,
      sourceKind: "text",
    },
    {
      notebookId: nb.id,
      title: "High-Yield: Concussion (SCAT6 / VOMS)",
      content: `CONCUSSION ASSESSMENT TOOLS:
• SCAT6 (Sport Concussion Assessment Tool, 6th edition) — sideline + clinic
• Child SCAT6 for ages 8-12
• VOMS (Vestibular/Ocular Motor Screening) — smooth pursuits, saccades, near-point convergence, VOR, visual motion sensitivity
• BESS or modified BESS for balance

RED FLAGS (immediate referral / EMS):
• Loss of consciousness >1 minute
• Worsening headache, repeated vomiting
• Seizures, focal neurologic deficit
• Increasing confusion or deteriorating GCS
• Suspected cervical spine injury

RETURN TO PLAY:
• Stepwise CISG return-to-sport protocol — 24h+ at each stage, regress with symptom return
• Symptom-free at rest AND with exertion before progressing
• Final clearance by qualified physician
• Same-day return to play is contraindicated for any suspected concussion`,
      sourceKind: "text",
    },
    {
      notebookId: nb.id,
      title: "Emergency Action Plan (EAP) Essentials",
      content: `An EAP must be written, venue-specific, and rehearsed.

REQUIRED ELEMENTS:
• Personnel — roles assigned (caller, scene manager, equipment retriever, EMS escort)
• Communication — primary and backup (cell, landline, radio); 911/EMS contact
• Equipment — AED location, splints, spine board, airway adjuncts; check schedule
• Transportation — pre-arranged route, gate access codes, flight-for-life landing zone
• Venue map — entry points, EMS staging, athlete location

BEST PRACTICES:
• Annual review and rehearsal with all stakeholders
• Posted in athletic training facility AND at every venue
• Coordinated with local EMS — table-top + live drill
• Specific subplans for: cardiac arrest, c-spine injury, heat stroke, severe weather, lightning`,
      sourceKind: "text",
    },
  ]);

  // 5. Question bank — covering all 5 domains
  const Q = (
    domainCode: keyof typeof D,
    topicName: string,
    taskCode: string,
    stem: string,
    choices: string[],
    correctIndex: number,
    rationale: string,
    difficulty = 2,
  ) => ({
    domainId: D[domainCode],
    topicId: T[topicName],
    taskId: TASK[taskCode],
    stem,
    choices,
    correctIndex,
    rationale,
    difficulty,
    sourceKind: "ai",
    enabled: true,
    pendingReview: false,
  });

  await db.insert(questions).values([
    Q(
      "D3", "Heat Illness", "0303",
      "An athlete collapses during a football practice with WBGT 88°F. Rectal temperature is 106.2°F and they are confused. What is the FIRST priority?",
      ["Transport to ED immediately", "Begin cold-water immersion on-site", "Administer IV fluids", "Apply ice packs to femoral arteries only"],
      1,
      "Exertional heat stroke is treated with COOL FIRST, TRANSPORT SECOND. Cold-water immersion is the gold standard and should begin on-site before EMS transport.",
    ),
    Q(
      "D3", "Heat Illness", "0303",
      "Which body site provides the only accurate measurement of core temperature in a suspected exertional heat stroke?",
      ["Tympanic", "Axillary", "Rectal", "Oral"],
      2,
      "Only rectal temperature is accurate during exercise; oral, tympanic, and axillary readings are unreliable when an athlete is sweating or dehydrated.",
    ),
    Q(
      "D3", "Cardiopulmonary Emergencies", "0303",
      "An adult athlete collapses and is unresponsive with no normal breathing. After calling for help and an AED, what is the next step?",
      ["Check pulse for 30 seconds", "Begin chest compressions at 100-120/min", "Wait for AED before starting CPR", "Give 2 rescue breaths first"],
      1,
      "Per current ECC guidelines, begin high-quality compressions immediately at 100-120/min. Pulse check should not exceed 10 seconds. Do not delay compressions for the AED.",
    ),
    Q(
      "D3", "Spinal Injury Management", "0303",
      "On-field, a football player has a suspected cervical spine injury and is supine in pads and helmet. The athlete is breathing normally. What is the recommended approach?",
      ["Remove the helmet immediately, leave shoulder pads", "Leave helmet and shoulder pads on, immobilize as a unit", "Remove both helmet and shoulder pads at once", "Cut the face mask only and immobilize with helmet/pads in place"],
      3,
      "Current consensus: if the airway is patent, cut/remove the face mask for airway access but keep both helmet and shoulder pads in place to maintain spinal alignment.",
    ),
    Q(
      "D2", "Concussion Assessment", "0203",
      "Which finding on the sideline most strongly indicates the need for IMMEDIATE EMS activation?",
      ["Headache rated 4/10", "Brief disorientation lasting 30 seconds", "Repeated vomiting and worsening headache", "Mild balance error on BESS"],
      2,
      "Repeated vomiting and worsening headache are red flags for intracranial pathology and require immediate EMS activation and physician evaluation.",
    ),
    Q(
      "D2", "Concussion Assessment", "0202",
      "VOMS testing primarily evaluates which system?",
      ["Cardiopulmonary", "Vestibular and ocular-motor", "Peripheral nervous", "Cervical mechanical"],
      1,
      "The Vestibular/Ocular Motor Screening (VOMS) examines smooth pursuits, saccades, near-point convergence, VOR, and visual motion sensitivity.",
    ),
    Q(
      "D2", "Lower Extremity Special Tests", "0202",
      "A positive Lachman test indicates injury to which structure?",
      ["Posterior cruciate ligament", "Anterior cruciate ligament", "Medial meniscus", "Lateral collateral ligament"],
      1,
      "The Lachman test isolates the ACL by assessing anterior tibial translation at 20-30° of knee flexion. It is the most sensitive ACL test.",
    ),
    Q(
      "D2", "Lower Extremity Special Tests", "0202",
      "Which test is most specific for an anterior talofibular ligament (ATFL) sprain?",
      ["Talar tilt", "Anterior drawer of the ankle", "Squeeze test", "Thompson test"],
      1,
      "The anterior drawer test stresses the ATFL specifically. The talar tilt assesses the CFL; the squeeze test assesses syndesmosis; Thompson assesses Achilles.",
    ),
    Q(
      "D2", "Upper Extremity Special Tests", "0202",
      "A positive Hawkins-Kennedy test suggests:",
      ["Glenohumeral instability", "Subacromial impingement", "AC joint sprain", "Biceps tendon rupture"],
      1,
      "Hawkins-Kennedy passively flexes the shoulder to 90° and internally rotates, compressing the supraspinatus under the coracoacromial arch — positive for subacromial impingement.",
    ),
    Q(
      "D2", "Upper Extremity Special Tests", "0202",
      "The empty-can (Jobe) test primarily evaluates which muscle?",
      ["Infraspinatus", "Teres minor", "Supraspinatus", "Subscapularis"],
      2,
      "Resisted abduction at 90° in the scapular plane with thumbs down (empty can) isolates the supraspinatus.",
    ),
    Q(
      "D2", "Spine Evaluation", "0202",
      "Spurling's test is positive when:",
      ["Hip flexion reproduces low back pain", "Cervical compression with extension and rotation reproduces radicular arm pain", "Resisted shoulder abduction reproduces shoulder pain", "SI compression reproduces buttock pain"],
      1,
      "Spurling's compresses the cervical spine in extension and rotation toward the affected side, narrowing the neural foramen and reproducing radicular symptoms in cervical radiculopathy.",
    ),
    Q(
      "D4", "Therapeutic Modalities", "0404",
      "Therapeutic ultrasound at 3 MHz is BEST suited for tissues at what depth?",
      ["1-2 cm (superficial)", "3-5 cm (deep)", "Bone interface only", "Any depth"],
      0,
      "Higher frequency (3 MHz) is absorbed superficially (1-2 cm). 1 MHz penetrates deeper (3-5 cm). Wavelength is inversely related to frequency.",
    ),
    Q(
      "D4", "Therapeutic Modalities", "0404",
      "Cryotherapy is contraindicated in which condition?",
      ["Acute ankle sprain", "Raynaud's phenomenon", "Post-exercise muscle soreness", "Tendinitis"],
      1,
      "Raynaud's phenomenon causes vasospasm with cold exposure — cryotherapy is contraindicated. Other listed conditions are common indications.",
    ),
    Q(
      "D4", "Therapeutic Exercise", "0403",
      "Closed kinetic chain exercises for ACL rehabilitation are preferred over open-chain because they:",
      ["Place greater stress on the ACL graft", "Better simulate functional weight-bearing and reduce ACL strain", "Allow heavier loading for hypertrophy", "Are required for HIPAA compliance"],
      1,
      "CKC exercises (squats, lunges) better replicate functional demands and produce less anterior tibial shear/ACL strain than open-chain leg extension at end-range.",
    ),
    Q(
      "D4", "Pharmacology", "0407",
      "An athlete reports taking an NSAID for shin pain. Which is a recognized risk of chronic NSAID use?",
      ["Improved bone healing", "GI bleeding and renal impairment", "Hypoglycemia", "Tendon hypertrophy"],
      1,
      "NSAIDs inhibit COX, with well-known risks of GI ulceration/bleeding and renal impairment. They may also impair early bone and soft-tissue healing.",
    ),
    Q(
      "D4", "Manual Therapy", "0405",
      "Grade I-II joint mobilizations are primarily used to:",
      ["Increase joint range of motion", "Modulate pain", "Stretch the joint capsule", "Replace surgical intervention"],
      1,
      "Low-grade (I-II) oscillations stay within slack and are used for pain modulation and neuromuscular reflex inhibition. Grades III-IV target capsule stretching for ROM.",
    ),
    Q(
      "D1", "Environmental Conditions", "0105",
      "Activity should be SUSPENDED based on lightning safety guidelines when:",
      ["Lightning is visible 30+ miles away", "Thunder is heard or lightning seen, regardless of distance", "Rain begins falling", "Wind exceeds 25 mph"],
      1,
      "If thunder is heard or lightning seen, suspend activity and seek shelter; resume no sooner than 30 minutes after the LAST observed thunder/lightning.",
    ),
    Q(
      "D1", "Protective Equipment", "0102",
      "Properly fitted football shoulder pads should:",
      ["Extend 1 inch beyond the shoulder tip", "Cover the AC joint with the cup centered over the deltoid", "Allow free shoulder shrugging without restriction", "Sit loosely so airflow is maximized"],
      1,
      "Shoulder pads must cover and protect the AC joint with the cup centered over the deltoid. They should fit snugly and not rotate during contact.",
    ),
    Q(
      "D1", "Nutrition & Hydration", "0104",
      "RED-S (Relative Energy Deficiency in Sport) is characterized by:",
      ["Excess caloric intake", "Low energy availability with broad health and performance consequences", "Acute dehydration only", "Solely menstrual dysfunction"],
      1,
      "RED-S expands beyond the female athlete triad to recognize low energy availability impacting metabolism, bone, immune, cardiovascular, and psychological health in all athletes.",
    ),
    Q(
      "D1", "Mental Health Screening", "0101",
      "Which screening tool is most appropriate for routine depression screening in athletes?",
      ["BESS", "PHQ-9", "VOMS", "Y-Balance"],
      1,
      "The PHQ-9 is a validated 9-item self-report screen for depression. BESS/VOMS assess concussion; Y-Balance assesses dynamic stability.",
    ),
    Q(
      "D5", "Documentation & SOAP Notes", "0504",
      "In a SOAP note, the 'O' section contains:",
      ["The athlete's reported symptoms", "Objective measurable findings (ROM, MMT, special tests)", "Treatment plan", "The clinician's interpretation of the diagnosis"],
      1,
      "S = subjective (athlete report); O = objective (measurable findings); A = assessment (clinical impression/diagnosis); P = plan (treatment and progression).",
    ),
    Q(
      "D5", "Documentation & SOAP Notes", "0503",
      "Which law primarily protects the privacy of student educational records, including some athletic injury records in school settings?",
      ["HIPAA", "FERPA", "OSHA", "ADA"],
      1,
      "FERPA governs student education records in schools that receive federal funding. HIPAA covers protected health information in healthcare settings.",
    ),
    Q(
      "D5", "Emergency Action Plans", "0502",
      "Which is a REQUIRED element of an Emergency Action Plan (EAP)?",
      ["A list of preferred sports drinks", "Venue-specific personnel roles, communication, and EMS access", "Strength-and-conditioning program", "Annual nutrition assessment"],
      1,
      "EAPs must define personnel roles, communication, equipment, transportation, and venue-specific EMS access; they should be rehearsed annually.",
    ),
    Q(
      "D5", "Professional Standards", "0503",
      "An AT is asked to evaluate an injury outside their state of licensure during travel with the team. The most appropriate action is to:",
      ["Refuse all care", "Practice as in their home state — credentials transfer automatically", "Verify the host state's regulatory requirements and any travel exemptions before practicing", "Have the coach perform the evaluation"],
      2,
      "State regulation governs scope of practice. ATs must verify host-state requirements; some states have travel/visiting-clinician exemptions, others do not.",
    ),
    Q(
      "D5", "Professional Standards", "0503",
      "Per the BOC Standards of Professional Practice, discussing specific BOC exam content publicly:",
      ["Is encouraged to help future candidates", "Is acceptable in private study groups", "Violates the standards and may result in disciplinary action", "Is permitted after one year"],
      2,
      "Disclosing exam content violates the BOC Standards of Professional Practice and may result in invalidated results or disciplinary action.",
    ),
  ]);

  // 6. Resources
  await db.insert(resources).values([
    {
      title: "NATA Position Statement: Exertional Heat Illnesses",
      url: "https://www.nata.org/sites/default/files/exertional-heat-illnesses.pdf",
      kind: "guideline",
      provider: "NATA",
      topicId: T["Heat Illness"],
      domainId: D.D3,
      notes: "Definitive guideline on prevention, recognition, and treatment.",
    },
    {
      title: "Sport Concussion Assessment Tool (SCAT6)",
      url: "https://bjsm.bmj.com/content/57/11/622",
      kind: "guideline",
      provider: "British Journal of Sports Medicine",
      topicId: T["Concussion Assessment"],
      domainId: D.D2,
      notes: "Free SCAT6 documents and Amsterdam consensus.",
    },
    {
      title: "AHA CPR & ECC Guidelines",
      url: "https://cpr.heart.org/en/resuscitation-science/cpr-and-ecc-guidelines",
      kind: "guideline",
      provider: "American Heart Association",
      topicId: T["Cardiopulmonary Emergencies"],
      domainId: D.D3,
    },
    {
      title: "Physiopedia — Free Clinical Reference",
      url: "https://www.physio-pedia.com",
      kind: "reference",
      provider: "Physiopedia",
      domainId: D.D2,
      notes: "Open-access reference for special tests and rehab protocols.",
    },
    {
      title: "PubMed Central — Open-Access Journals",
      url: "https://www.ncbi.nlm.nih.gov/pmc/",
      kind: "reference",
      provider: "NIH",
      notes: "Search for primary literature behind every BOC concept.",
    },
    {
      title: "BOC Candidate Handbook (2025-2027)",
      url: "https://bocatc.org/candidates/exam-preparation-tools",
      kind: "handbook",
      provider: "Board of Certification",
      domainId: D.D5,
      notes: "Official exam policy document. Read once cover-to-cover.",
    },
  ]);

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
