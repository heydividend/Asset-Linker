// Canned, high-yield per-domain review sheets aligned to the BOC Practice
// Analysis 8th Edition (PA8). These are concise, exam-focused cram sheets —
// distinct from the AI/notebook-generated study guides. They are additive
// reference content keyed by domain code (D1–D5).

export interface ReviewSheet {
  code: string; // domain code, e.g. "D1"
  title: string;
  summary: string;
  estMinutes: number;
  markdown: string;
}

export const REVIEW_SHEETS: ReviewSheet[] = [
  {
    code: "D1",
    title: "Risk Reduction, Wellness & Health Literacy",
    summary:
      "Screening, prevention, environmental safety, and patient education to minimize injury and illness.",
    estMinutes: 15,
    markdown: `# Domain 1 — Risk Reduction, Wellness & Health Literacy

**PA8 weight: ~20%.** Focus: promoting healthy behaviors and reducing the risk of injury and illness through screening, education, and environmental control.

## High-Yield Concepts

### Pre-Participation Examination (PPE)
- **Primary goal:** detect conditions that predispose to injury, illness, or sudden death (not to disqualify).
- Core components: history (most sensitive part), cardiovascular screen, musculoskeletal screen, vitals/vision.
- **Red flags for cardiac sudden death:** exertional syncope, chest pain with exercise, family history of sudden death < 50, known structural heart disease (e.g., HCM — leading cause of sudden cardiac death in young athletes).

### Environmental Conditions
- **Heat illness prevention:** monitor **WBGT** (wet bulb globe temperature), acclimatize over 10–14 days, hydration, work:rest ratios, modify/cancel activity at high WBGT.
- WBGT formula emphasis: **wet bulb (humidity) is weighted most heavily (0.7)**, then black globe (0.2), then dry bulb (0.1).
- **Lightning:** "When thunder roars, go indoors." 30-30 rule — seek shelter at flash-to-bang ≤ 30 s; wait **30 minutes** after the last thunder/lightning before resuming.
- **Cold:** layering, watch wind chill, recognize hypothermia/frostbite risk.

### Hydration & Fluid Balance
- Monitor body-weight changes and urine color.
- **> 2% body-weight loss** impairs performance; replace ~ pre-exercise weight loss.
- Recognize **hyponatremia** (overhydration with water) vs dehydration.

### Protective Equipment & Skin
- Equipment must meet standards (e.g., **NOCSAE** for helmets); proper fitting is the AT's responsibility.
- Skin infections (MRSA, herpes gladiatorum, tinea): emphasize hygiene, no shared towels/equipment, return-to-play rules for wrestlers.

### Health Literacy & Wellness
- **Health literacy** = capacity to obtain, process, and understand basic health info to make decisions; tailor education to the patient.
- Promote the dimensions of wellness (physical, emotional, social, intellectual, spiritual, occupational, environmental).
- Use evidence-based, plain-language education and the **teach-back** method to confirm understanding.

## Quick Hits
- Surveillance data (injury tracking) drives prevention programs.
- Prophylactic measures: bracing, taping, neuromuscular training (e.g., **FIFA 11+** reduces ACL/lower-extremity injury).
- Tobacco/alcohol/supplement counseling falls under wellness promotion.
`,
  },
  {
    code: "D2",
    title: "Assessment, Evaluation & Diagnosis",
    summary:
      "History, physical exam, clinical and differential diagnosis, and building the plan of care.",
    estMinutes: 18,
    markdown: `# Domain 2 — Assessment, Evaluation & Diagnosis

**PA8 weight: ~25.6% (largest domain).** Focus: systematic, evidence-based evaluation to form a valid clinical and differential diagnosis and a plan of care.

## The Evaluation Framework — HOPS / SOAP
- **HOPS:** History → Observation → Palpation → Special tests.
- **SOAP:** Subjective, Objective, Assessment, Plan (documentation).
- **History is the most important step** — it directs the rest of the exam.

## High-Yield Special Tests (know test → structure)
- **Knee:** Lachman (best for ACL), anterior drawer (ACL), posterior drawer/sag (PCL), valgus stress (MCL), varus stress (LCL), McMurray/Thessaly (meniscus).
- **Shoulder:** Empty can/Jobe (supraspinatus), Hawkins-Kennedy & Neer (impingement), apprehension/relocation (anterior instability), Speed's/Yergason's (biceps/labrum), drop-arm (rotator cuff tear).
- **Ankle:** anterior drawer (ATFL), talar tilt (CFL), Thompson (Achilles rupture), Kleiger/external rotation (high ankle/syndesmosis).
- **Special situations:** Spurling's (cervical radiculopathy), straight-leg raise (lumbar disc/sciatica), Phalen's/Tinel's (carpal tunnel), Ottawa rules (foot/ankle & knee fracture screening).

## Goniometry & MMT
- **MMT grading 0–5:** 0 none, 1 trace, 2 full ROM gravity-eliminated, 3 full ROM against gravity, 4 against some resistance, 5 normal/full resistance.
- Document ROM in degrees; compare bilaterally.

## Clinical vs Differential Diagnosis
- **Clinical diagnosis:** the most likely cause based on findings.
- **Differential diagnosis:** the ranked list of alternatives to rule out.
- Recognize **referred pain** patterns and **red flags** requiring referral (e.g., visceral pain, neuro deficits, suspected fracture).

## End-Feels & Tissue
- Normal: soft (tissue approximation), firm (capsular/ligamentous), hard (bone).
- Abnormal: empty (pain), boggy (effusion), springy block (meniscus).

## Quick Hits
- Selective tissue tension: active ROM (patient), passive ROM (contractile vs inert), resisted (contractile).
- Use **evidence-based** tests with strong sensitivity/specificity; SnNout (sensitive test, negative rules out) / SpPin (specific test, positive rules in).
- Always assess **neurovascular status** distal to injury.
`,
  },
  {
    code: "D3",
    title: "Immediate & Emergency Care",
    summary:
      "Emergency action plans, triage, and evidence-based emergent care to reduce morbidity and mortality.",
    estMinutes: 18,
    markdown: `# Domain 3 — Immediate & Emergency Care

**PA8 weight: ~20.8%.** Focus: best practices in immediate and emergency care for optimal outcomes. High stakes — many extreme-harm tasks live here.

## Emergency Action Plan (EAP)
- Venue-specific, **written, rehearsed annually**, with roles, communication, equipment, and EMS access routes.
- Know location of AED, emergency equipment, and how to direct EMS.

## Primary Survey — Life Threats First
- **CABs (adult CPR):** Compressions, Airway, Breathing. High-quality compressions **100–120/min**, depth **≥ 2 in (5 cm)**, full recoil, minimize interruptions.
- Use the **AED as soon as available**; defibrillation early is the strongest survival factor in sudden cardiac arrest.

## Critical Emergencies (recognize + manage)
- **Exertional heat stroke:** core temp **> 104°F (40°C)** + CNS dysfunction. **Cool first, transport second** — immediate **cold-water immersion** is the standard of care.
- **Spine injury / suspected cervical spine:** maintain in-line stabilization, do **NOT** remove a properly fitted helmet **and** shoulder pads (remove together or leave both); use face-mask removal for airway access.
- **Exertional sickling / sickle cell collapse:** stop activity, recognize early — muscles "give out," not cramping.
- **Anaphylaxis:** epinephrine auto-injector IM (vastus lateralis), activate EMS.
- **Diabetic emergency:** if unsure hypo vs hyper, treat for **hypoglycemia** (give sugar).
- **Asthma:** rescue inhaler (short-acting beta-2 agonist); watch for respiratory distress.
- **Head injury / concussion:** remove from play, serial assessment (SCAT), watch for deteriorating signs (worsening headache, vomiting, unequal pupils → emergency).

## Bleeding & Shock
- Control hemorrhage: direct pressure → tourniquet for life-threatening limb bleeding.
- Recognize shock: rapid weak pulse, pale/cool clammy skin, AMS; treat and transport.

## Triage
- Rapidly classify severity; prioritize airway/breathing/circulation and catastrophic injuries.

## Quick Hits
- Lightning, environmental, and pandemic responses fall here too.
- **Catastrophic injury** = head, neck/spine, sudden cardiac, heat stroke, exertional sickling — these drive EAP design.
- Document the incident thoroughly and review/update the EAP after every activation.
`,
  },
  {
    code: "D4",
    title: "Therapeutic Intervention & Rehabilitation",
    summary:
      "Therapeutic exercise, modalities, and manual therapy to restore activity and participation.",
    estMinutes: 18,
    markdown: `# Domain 4 — Therapeutic Intervention

**PA8 weight: ~25.6% (tied largest).** Focus: rehabilitating patients with therapeutic exercise, modalities, and manual techniques to optimize activity and participation, plus managing general medical conditions.

## Tissue Healing Phases (drives the plan of care)
1. **Inflammatory** (0–~4 days): control swelling/pain — **PEACE & LOVE** has replaced strict RICE (Protect, Elevate, Avoid anti-inflammatories early, Compress, Educate / then Load, Optimism, Vascularization, Exercise).
2. **Proliferation/Fibroblastic** (~day 2–6 weeks): collagen formation, begin controlled loading/ROM.
3. **Maturation/Remodeling** (weeks–months): collagen aligns to stress — progressive strengthening and sport-specific work.

## Therapeutic Modalities
- **Cryotherapy (acute):** vasoconstriction, ↓ pain/metabolism/swelling. 15–20 min.
- **Thermotherapy (subacute/chronic):** vasodilation, ↑ blood flow/extensibility. **Never** apply heat to acute injury.
- **Ultrasound:** thermal (continuous, 3 MHz superficial / 1 MHz deep) vs non-thermal (pulsed). Avoid over growth plates, eyes, pacemakers, malignancy.
- **Electrical stimulation:** TENS (pain — gate control / opioid), NMES/Russian (muscle re-education & strengthening), HVPC (edema/pain).
- **Gate control theory:** non-painful input closes the "gate" to pain transmission.

## Therapeutic Exercise Progression
- ROM → flexibility → strength/endurance → power → **proprioception/neuromuscular control** → sport-specific/functional.
- **Open kinetic chain** (foot/hand free) vs **closed kinetic chain** (fixed, more functional/joint-protective).
- **PRE / DAPRE** progressive resistance; **PNF** stretching (hold-relax, contract-relax).
- Types of contraction: isometric, isotonic (concentric/eccentric), isokinetic. **Eccentric** loading is key for tendinopathy (e.g., Alfredson protocol).

## Manual Therapy
- Joint mobilization grades I–V (I–II pain, III–IV stiffness/ROM, V = thrust/manipulation).
- **Convex-concave rule** governs glide direction; soft-tissue and myofascial techniques supplement.

## Return to Participation
- Criteria-based: pain-free full ROM, ~**90% strength** vs contralateral, functional testing (hop tests), sport-specific readiness, psychological readiness.

## Quick Hits
- **SAID principle** (Specific Adaptation to Imposed Demands) — train how you want to perform.
- Manage general medical conditions and basic pharmacology (know indications/contraindications, not prescribing).
- Document objective, measurable goals (short- and long-term).
`,
  },
  {
    code: "D5",
    title: "Healthcare Administration & Professional Responsibility",
    summary:
      "Policy, documentation, law, ethics, and basic business practices for quality patient care.",
    estMinutes: 15,
    markdown: `# Domain 5 — Healthcare Administration & Professional Responsibility

**PA8 weight: ~8% (smallest, but high importance).** Focus: policy construction, documentation, laws/regulations, and basic business practices.

## Laws & Regulations (know what each protects)
- **HIPAA:** privacy and security of protected health information (PHI).
- **FERPA:** privacy of student education records (applies in school settings; can overlap with athletic records).
- **OSHA / bloodborne pathogen standard:** universal precautions, PPE, exposure control plan, sharps disposal.
- **ADA:** prevents discrimination based on disability; reasonable accommodations.
- **Title IX:** sex equity in education-based programs.
- **State Practice Act:** defines AT scope of practice and licensure — practice within it.

## Documentation
- **SOAP notes**; documentation must be accurate, timely, objective, and legally defensible.
- Maintain records per retention requirements; protect confidentiality.
- **Informed consent** required before treatment; **minors** require par/guardian consent.

## Legal Concepts
- **Negligence (4 elements):** Duty, Breach of duty, Causation, Damages.
- **Standard of care:** what a reasonably prudent AT would do.
- **Good Samaritan laws** offer limited protection for volunteer emergency aid.
- **Liability:** malpractice insurance; act only within scope and competence.

## Ethics & Professionalism
- Follow the **BOC Standards of Professional Practice** and **NATA Code of Ethics**.
- Patient autonomy, beneficence, non-maleficence, justice.
- Maintain certification: **continuing education (CEUs)**, emergency cardiac care current.

## Administration & Business
- Budgeting, inventory, facility design (safety, accessibility, infection control).
- **Quality improvement / outcomes:** use patient-reported outcome measures (PROMs) and data to improve care.
- Policies & procedures manual; pre-participation, emergency, and weather policies in writing.

## Quick Hits
- **Patient-centered care** and interprofessional communication.
- Third-party reimbursement basics, ICD/CPT coding awareness.
- Risk management = reducing legal exposure through documentation, consent, and adherence to standards.
`,
  },
];

export function listReviewSheets() {
  return REVIEW_SHEETS.map(({ code, title, summary, estMinutes }) => ({
    code,
    title,
    summary,
    estMinutes,
  }));
}

export function getReviewSheet(code: string): ReviewSheet | undefined {
  return REVIEW_SHEETS.find((s) => s.code.toLowerCase() === code.toLowerCase());
}
