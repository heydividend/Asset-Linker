export type Injury = {
  name: string;
  redFlags?: string[];
  evaluation: string[];
  treatment: string[];
  rtp?: string;
};

export type BodyRegion = {
  id: string;
  name: string;
  domain: string; // BOC domain it ties into
  shape: "circle" | "ellipse" | "rect";
  cx?: number;
  cy?: number;
  r?: number;
  rx?: number;
  ry?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  labelX: number;
  labelY: number;
  side: "front" | "back" | "both";
  blurb: string;
  injuries: Injury[];
  highYield: string[];
  /**
   * BOC topic names this region drills into. Resolved at runtime via the
   * topics API to seeded topic IDs, so the "Quiz this region" CTA can fire
   * `POST /api/quizzes` with concrete topic IDs.
   */
  topicNames: string[];
};

export const bodyRegions: BodyRegion[] = [
  {
    id: "head",
    name: "Head & Brain",
    domain: "Critical Incident Management",
    shape: "ellipse", cx: 100, cy: 42, rx: 28, ry: 32,
    labelX: 145, labelY: 42, side: "both",
    blurb: "Concussion, skull fx, eye/ear/nose/face/dental injuries.",
    injuries: [
      {
        name: "Sport-related concussion",
        redFlags: ["LOC > 30 s", "GCS < 15", "worsening HA", "repeated vomiting", "seizure", "focal neuro deficit", "unequal pupils", "Battle sign / raccoon eyes (basilar skull fx)"],
        evaluation: [
          "Remove from play immediately — when in doubt, sit them out.",
          "SCAT6 (≥13 yr) or Child SCAT6 (5–12 yr) sideline assessment.",
          "Symptom checklist, cognitive screen, mBESS, tandem gait.",
          "VOMS: smooth pursuit, saccades, near-point convergence (abnormal ≥6 cm), VOR, visual motion sensitivity.",
          "Refer to physician for any red flag or persistent symptoms.",
        ],
        treatment: [
          "24–48 h relative rest, then sub-symptom-threshold aerobic activity (Buffalo treadmill test guides intensity).",
          "Stepwise 6-stage RTP progression — 24 h between stages.",
          "No same-day return to play in any organized sport.",
          "Academic accommodations during symptomatic phase.",
        ],
        rtp: "Symptom-free at rest AND through full progression AND medical clearance.",
      },
      {
        name: "Orbital blowout fracture / globe injury",
        redFlags: ["diplopia (esp. upward gaze)", "enophthalmos", "infraorbital numbness", "hyphema (blood in anterior chamber)", "ruptured globe — teardrop pupil, extruded contents"],
        evaluation: [
          "Direct blow from object smaller than orbit (racquetball, fist, elbow).",
          "Check vision, EOMs, pupils (PERRLA), confrontation visual fields.",
          "Palpate orbital rim for step-off; check infraorbital sensation (V2).",
        ],
        treatment: [
          "Suspected globe rupture: rigid eye shield (NO patch / pressure), upright transport, NPO, EMS.",
          "Hyphema: upright posture, rigid shield, urgent ophthalmology — high re-bleed risk.",
          "Blowout fx: ice, head elevation, nasal precautions (no nose-blowing), urgent referral.",
        ],
      },
      {
        name: "Nasal fracture / epistaxis",
        evaluation: [
          "Inspect for septal deviation; palpate dorsum for crepitus / step-off.",
          "Check septum for hematoma (bluish, boggy swelling) — must be drained <24 h to prevent saddle-nose / cartilage necrosis.",
          "Rule out CSF rhinorrhea (clear fluid, halo sign on gauze) → basilar skull fx.",
        ],
        treatment: [
          "Anterior epistaxis: lean forward, pinch soft cartilage 10–15 min, ice to bridge.",
          "Refer for reduction within 5–10 days while still mobile.",
          "Septal hematoma → ENT same-day for drainage.",
        ],
      },
      {
        name: "Dental avulsion (knocked-out permanent tooth)",
        redFlags: ["associated mandible fx", "airway compromise from displaced teeth"],
        evaluation: [
          "Identify permanent vs deciduous (do NOT replant deciduous).",
          "Handle by crown only — never the root.",
          "Inspect socket for fracture / debris.",
        ],
        treatment: [
          "Rinse gently with saline (do NOT scrub).",
          "Replant in socket within 30 min for best prognosis (every minute counts).",
          "If unable to replant: store in Hank's Balanced Salt Solution > milk > saliva (cheek pouch in conscious athlete) > saline. NEVER water.",
          "Urgent dental referral.",
        ],
      },
      {
        name: "Auricular hematoma ('cauliflower ear')",
        evaluation: [
          "Common in wrestlers, BJJ, rugby — shear injury to auricle.",
          "Painful, fluctuant swelling separating perichondrium from cartilage.",
        ],
        treatment: [
          "Drain within 7 days (needle aspiration or I&D) followed by compressive bolster dressing.",
          "Untreated → avascular necrosis of cartilage → permanent deformity.",
          "Prevent with properly fitted headgear.",
        ],
      },
    ],
    highYield: [
      "SCAT6 replaced SCAT5 in 2023 (Amsterdam Consensus).",
      "VOMS near-point convergence ≥6 cm = abnormal, supports concussion dx.",
      "Second-impact syndrome → diffuse cerebral edema, often fatal.",
      "Avulsed tooth: replant <30 min; storage order = HBSS > milk > saliva > saline (NEVER water).",
      "Globe rupture: rigid shield only — no patch, no pressure, NPO, upright transport.",
      "Battle sign (mastoid bruise) or raccoon eyes = basilar skull fracture → EMS.",
      "EAP must specify spine-board, AED, EMS activation.",
    ],
    topicNames: ["Concussion Assessment", "Emergency Action Plans"],
  },
  {
    id: "cspine",
    name: "Cervical Spine",
    domain: "Critical Incident Management",
    shape: "rect", x: 88, y: 74, width: 24, height: 16,
    labelX: 145, labelY: 82, side: "both",
    blurb: "C-spine sprain, stinger, disc herniation, suspected fracture.",
    injuries: [
      {
        name: "Suspected cervical fracture",
        redFlags: ["midline tenderness", "neuro deficit", "altered mental status", "distracting injury", "high-energy MOI (axial loading, spear tackle)"],
        evaluation: [
          "Manual in-line stabilization — head squeeze, do NOT remove helmet on field.",
          "Spine-boarding with log-roll or 6+ plus lift technique.",
          "NEXUS criteria: no midline tenderness, no intoxication, normal alertness, no focal deficit, no distracting injury → may clear.",
          "Canadian C-Spine rule alternative for low-risk patients.",
          "Activate EMS; transport with hard collar.",
        ],
        treatment: [
          "Field: immobilize, transport to trauma center.",
          "Helmet/shoulder pads off TOGETHER (current consensus) once at facility — never one without the other.",
          "Face mask removal with cordless screwdriver to access airway while pads on.",
        ],
      },
      {
        name: "Cervical disc herniation / radiculopathy",
        redFlags: ["bilateral UE symptoms", "myelopathy signs (Hoffmann, hyperreflexia, gait disturbance)", "bowel/bladder change"],
        evaluation: [
          "Spurling test (extension + ipsilateral side-bend + axial compression) reproduces radicular symptoms.",
          "Distraction test relieves symptoms = +.",
          "Upper-limb tension test (median bias) most sensitive.",
          "Dermatomal sensory + myotomal MMT + DTR (biceps C5–6, brachioradialis C6, triceps C7).",
        ],
        treatment: [
          "Conservative: cervical traction, postural retraining, deep neck flexor activation, neural mobilization.",
          "Refer for myelopathy or persistent radiculopathy >6 wk.",
        ],
      },
      {
        name: "Brachial plexus stinger / burner",
        evaluation: ["Unilateral arm burning, weakness, NO neck pain.", "Resolves in seconds–minutes."],
        treatment: ["Hold from contact until full strength + painless ROM.", "Bilateral sx → treat as c-spine until cleared.", "Recurrent stingers → cervical roll / 'cowboy collar', neuromuscular control work."],
      },
    ],
    highYield: [
      "Bilateral upper-extremity sx after impact = c-spine until proven otherwise.",
      "NEXUS low-risk criteria can clear c-spine without imaging — memorize all 5.",
      "Helmet AND shoulder pads come off TOGETHER (current consensus) — equipment-laden athlete is in alignment.",
      "Catastrophic injury management is consistently tested on the BOC.",
    ],
    topicNames: ["Spine Evaluation", "Spinal Injury Management"],
  },
  {
    id: "shoulder-r",
    name: "Right Shoulder",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 62, cy: 105, rx: 18, ry: 14,
    labelX: 14, labelY: 105, side: "front",
    blurb: "RTC, AC sprain, GH dislocation, scapular dyskinesis.",
    injuries: [
      {
        name: "Anterior glenohumeral dislocation",
        redFlags: ["axillary nerve deficit (deltoid sensation)", "vascular compromise"],
        evaluation: [
          "Mechanism: ABER + posterior force.",
          "Squared-off deltoid, arm held in slight ABD/ER.",
          "Apprehension / relocation / load-and-shift tests after reduction.",
          "Always check axillary n. before AND after reduction.",
        ],
        treatment: [
          "On-field reduction only with MD authorization.",
          "Sling 1–3 weeks, then progressive ROM → strengthening.",
          "Bankart / Hill-Sachs lesions common; MRI/MRA for recurrence.",
        ],
        rtp: "Painless full ROM, ≥90% strength, sport-specific apprehension testing negative.",
      },
      {
        name: "Rotator cuff tendinopathy / impingement",
        evaluation: ["Neer, Hawkins-Kennedy, painful arc 60–120°.", "Empty-can = supraspinatus."],
        treatment: ["Activity mod, NSAIDs, scapular stabilization, posterior capsule stretch, eccentric RTC strengthening."],
      },
      {
        name: "AC joint sprain",
        evaluation: ["Cross-body adduction test, AC tenderness.", "Rockwood I–VI grading from radiographs."],
        treatment: ["Grade I–II conservative; III controversial; IV–VI surgical."],
      },
    ],
    highYield: [
      "Drop-arm test → full-thickness supraspinatus tear.",
      "Sulcus sign → inferior / multidirectional instability.",
    ],
    topicNames: ["Upper Extremity Special Tests"],
  },
  {
    id: "shoulder-l",
    name: "Left Shoulder",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 138, cy: 105, rx: 18, ry: 14,
    labelX: 186, labelY: 105, side: "front",
    blurb: "Mirror of right shoulder — same evaluation principles.",
    injuries: [
      {
        name: "See Right Shoulder for full breakdown",
        evaluation: ["Same special tests apply bilaterally; always compare side-to-side."],
        treatment: ["Same staged rehabilitation."],
      },
    ],
    highYield: ["Always assess bilaterally for symmetry."],
    topicNames: ["Upper Extremity Special Tests"],
  },
  {
    id: "chest",
    name: "Chest & Cardiac",
    domain: "Critical Incident Management",
    shape: "rect", x: 78, y: 110, width: 44, height: 38,
    labelX: 14, labelY: 130, side: "front",
    blurb: "Commotio cordis, SCA, pneumothorax, rib fx, exercise-induced bronchoconstriction.",
    injuries: [
      {
        name: "Sudden cardiac arrest (SCA) / commotio cordis",
        redFlags: ["sudden collapse, no purposeful movement", "agonal/absent breathing", "no carotid pulse", "history of HCM, long QT, Marfan, prior syncope"],
        evaluation: [
          "Commotio cordis: blunt chest impact during T-wave repolarization (10–30 ms window) → VF.",
          "HCM is the leading cause of non-traumatic SCA in young athletes (US).",
          "Check responsiveness, breathing, pulse — no more than 10 sec to assess.",
        ],
        treatment: [
          "Activate EAP / EMS, start high-quality CPR (100–120/min, 2–2.4 in depth), attach AED ASAP.",
          "Time to defibrillation is THE single biggest predictor of survival.",
          "Continue compressions with minimal interruption until ROSC or EMS handoff.",
        ],
      },
      {
        name: "Tension pneumothorax",
        redFlags: ["tracheal deviation AWAY from injury", "absent breath sounds", "JVD", "shock"],
        evaluation: ["Sudden dyspnea after blow / rib fx.", "Hyperresonance on percussion."],
        treatment: ["EMS now — needle decompression by physician (2nd ICS midclavicular or 5th ICS anterior axillary)."],
      },
      {
        name: "Rib fracture / flail chest",
        redFlags: ["paradoxical chest wall motion (flail segment)", "dyspnea, hypoxia", "first-rib fx (high-energy → vascular injury)", "lower rib fx + LUQ pain (spleen) or RUQ pain (liver)"],
        evaluation: [
          "Point tenderness, crepitus; AP and lateral compression reproduce pain.",
          "Auscultate for decreased breath sounds (rule out pneumo/hemothorax).",
        ],
        treatment: [
          "Pain control to allow deep breathing → prevent atelectasis / pneumonia.",
          "Refer for chest imaging; flail chest → EMS, possible positive-pressure ventilation.",
          "No taping that restricts chest expansion.",
        ],
      },
      {
        name: "Exercise-induced bronchoconstriction / asthma exacerbation",
        redFlags: ["silent chest", "cyanosis", "tripod posture", "inability to speak in full sentences", "SpO₂ <92%"],
        evaluation: [
          "Wheezing, prolonged expiration, cough, chest tightness 5–15 min into exercise.",
          "Peak flow drop ≥10–15% from baseline.",
        ],
        treatment: [
          "Stop activity; SABA (albuterol) 2–4 puffs via spacer, repeat q20 min ×3 if needed.",
          "Severe / no response → EMS.",
          "Prevention: SABA 15 min pre-exercise, warm-up, avoid cold/dry air triggers.",
        ],
      },
    ],
    highYield: [
      "AED < 3 min from collapse = >90% survival in commotio cordis.",
      "HCM = #1 non-traumatic SCA cause in young US athletes; PPE history + auscultation are key.",
      "Every venue EAP must define AED location, target time-to-shock <3 min, and rehearse annually.",
      "Lower rib fx + LUQ pain = think spleen; + RUQ pain = think liver — image and refer.",
    ],
    topicNames: ["Cardiopulmonary Emergencies", "Emergency Action Plans"],
  },
  {
    id: "abdomen",
    name: "Abdomen",
    domain: "Critical Incident Management",
    shape: "rect", x: 80, y: 150, width: 40, height: 38,
    labelX: 14, labelY: 170, side: "front",
    blurb: "Splenic / liver / kidney injury, sports hernia, solar plexus contusion.",
    injuries: [
      {
        name: "Splenic rupture",
        redFlags: ["LUQ pain", "Kehr sign (referred L shoulder)", "hypotension, tachycardia", "abdominal rigidity / rebound", "syncope on standing"],
        evaluation: [
          "Mechanism: blunt LUQ trauma, esp. in mononucleosis-enlarged spleen.",
          "Most commonly injured solid abdominal organ in sport.",
          "Serial vitals — bleeding can present hours after impact.",
          "FAST exam / CT at hospital.",
        ],
        treatment: [
          "Activate EMS — surgical emergency.",
          "NPO, two large-bore IVs (in ED), monitor for shock.",
          "Mononucleosis: NO contact ×3 wk from symptom onset minimum (≥4 wk for collision sport).",
        ],
      },
      {
        name: "Liver / kidney contusion or laceration",
        redFlags: ["RUQ pain (liver) or flank pain (kidney)", "gross hematuria", "hypotension, tachycardia", "rigid abdomen"],
        evaluation: [
          "Liver: blunt RUQ trauma; referred R shoulder pain possible.",
          "Kidney: flank tenderness, costovertebral angle pain, +/- gross hematuria.",
          "Always urinalysis after significant flank/abdominal trauma.",
        ],
        treatment: [
          "EMS / ED transport for imaging (CT with contrast).",
          "NPO, bed rest, serial vitals; majority managed non-operatively if hemodynamically stable.",
          "Solitary kidney → counsel on contact-sport risk; modified protective gear.",
        ],
      },
      {
        name: "Athletic pubalgia / sports hernia",
        evaluation: [
          "Insidious or acute lower abdominal / inguinal pain with cutting, kicking, sit-ups.",
          "Tender pubic tubercle / conjoint tendon; pain with resisted sit-up + adduction.",
          "MRI to confirm; rule out true inguinal hernia (palpable bulge with Valsalva).",
        ],
        treatment: [
          "Conservative 6–8 wk: rest, core/adductor rehab, hip mobility.",
          "Surgical repair (mesh or pelvic floor) if conservative fails.",
        ],
      },
      {
        name: "Solar plexus contusion ('wind knocked out')",
        evaluation: [
          "Direct blow to epigastrium → transient diaphragmatic spasm and apnea.",
          "Self-limiting; rule out concurrent rib / spleen / liver injury.",
        ],
        treatment: [
          "Reassure, loosen restrictive clothing, encourage slow controlled breathing.",
          "Resolves within minutes; persistent symptoms → reassess for visceral injury.",
        ],
      },
    ],
    highYield: [
      "Spleen = most commonly injured solid abdominal organ in sport.",
      "Mono → no contact ×3 wk from symptom onset (≥4 wk for collision); palpation is unreliable, use ultrasound.",
      "Kehr sign (referred L shoulder pain) = splenic rupture until proven otherwise.",
      "Gross hematuria after flank trauma → urgent imaging and physician referral.",
    ],
    topicNames: ["Cardiopulmonary Emergencies"],
  },
  {
    id: "elbow-r",
    name: "Right Elbow",
    domain: "Therapeutic Intervention",
    shape: "ellipse", cx: 45, cy: 175, rx: 11, ry: 13,
    labelX: 14, labelY: 175, side: "front",
    blurb: "UCL sprain, epicondylitis, olecranon bursitis.",
    injuries: [
      {
        name: "UCL sprain ('Tommy John')",
        evaluation: ["Valgus stress at 30° flexion, moving valgus stress test.", "Common in throwers; pop + medial pain."],
        treatment: ["Grade I–II: rest, throwing program, PRP considered.", "Grade III in throwers: UCL reconstruction."],
      },
      {
        name: "Lateral epicondylitis",
        evaluation: ["Pain w/ resisted wrist extension, Cozen / Mill tests.", "ECRB tendinosis."],
        treatment: ["Counterforce brace, eccentric wrist extensor work, NSAIDs short-term."],
      },
    ],
    highYield: ["Pediatric: 'Little Leaguer's elbow' = medial epicondyle apophysitis (Salter-Harris risk)."],
    topicNames: ["Upper Extremity Special Tests", "Therapeutic Exercise"],
  },
  {
    id: "elbow-l",
    name: "Left Elbow",
    domain: "Therapeutic Intervention",
    shape: "ellipse", cx: 155, cy: 175, rx: 11, ry: 13,
    labelX: 186, labelY: 175, side: "front",
    blurb: "Mirror of right elbow.",
    injuries: [{ name: "See Right Elbow", evaluation: ["Bilateral comparison required."], treatment: ["Same protocols."] }],
    highYield: ["Always assess proximal & distal joints (kinetic chain)."],
    topicNames: ["Upper Extremity Special Tests"],
  },
  {
    id: "wrist-r",
    name: "Right Wrist & Hand",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 30, cy: 240, rx: 14, ry: 18,
    labelX: 14, labelY: 240, side: "front",
    blurb: "Scaphoid fx, TFCC, mallet/jersey finger.",
    injuries: [
      {
        name: "Scaphoid fracture",
        redFlags: ["snuffbox tenderness", "scaphoid tubercle pain", "axial loading pain"],
        evaluation: ["FOOSH mechanism.", "Initial X-rays often negative — repeat at 10–14 d or MRI."],
        treatment: ["Thumb spica IMMEDIATELY for any snuffbox tenderness even with negative film.", "Avascular necrosis risk — proximal pole."],
      },
      {
        name: "Mallet finger",
        evaluation: ["DIP cannot actively extend; passive intact."],
        treatment: ["Continuous DIP extension splint 6–8 wk (PIP free)."],
      },
    ],
    highYield: ["Snuffbox tenderness = scaphoid fx until proven otherwise — splint and refer."],
    topicNames: ["Upper Extremity Special Tests"],
  },
  {
    id: "wrist-l",
    name: "Left Wrist & Hand",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 170, cy: 240, rx: 14, ry: 18,
    labelX: 186, labelY: 240, side: "front",
    blurb: "Mirror of right wrist & hand.",
    injuries: [{ name: "See Right Wrist & Hand", evaluation: ["Same eval."], treatment: ["Same."] }],
    highYield: ["Splint in position of function."],
    topicNames: ["Upper Extremity Special Tests"],
  },
  {
    id: "lowback",
    name: "Lumbar Spine",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 80, y: 188, width: 40, height: 30,
    labelX: 14, labelY: 200, side: "back",
    blurb: "Strain, spondylolysis/listhesis, disc herniation, facet syndrome.",
    injuries: [
      {
        name: "Spondylolysis / spondylolisthesis",
        redFlags: ["progressive neuro deficit", "high-grade slip with hamstring spasm and 'crouched gait'"],
        evaluation: [
          "Adolescent extension-based athletes (gymnasts, linemen, divers).",
          "Stork (single-leg hyperextension) test reproduces pain.",
          "MRI is first-line; SPECT/CT for active stress reaction; lateral X-ray ('Scotty dog' sign).",
          "Meyerding grading I–V for slip severity.",
        ],
        treatment: [
          "Rest from extension activities 4–6 wk (longer for active fracture), anti-lordotic brace if symptomatic.",
          "Progressive core, glute, hamstring strengthening; avoid lumbar extension early.",
          "Grade III+ slip or progressive neuro sx → surgical referral.",
        ],
      },
      {
        name: "Lumbar disc herniation / radiculopathy",
        redFlags: ["saddle anesthesia, bowel/bladder dysfunction (cauda equina) — EMS NOW", "progressive motor weakness"],
        evaluation: [
          "SLR (sensitive) and crossed SLR (specific); slump test.",
          "Dermatomal sensory: L4 medial leg, L5 dorsum of foot/great toe, S1 lateral foot.",
          "Myotomes: L4 ant tib, L5 EHL/great toe ext, S1 peroneals/heel rise.",
          "DTR: L4 patellar, S1 Achilles.",
        ],
        treatment: [
          "Conservative: McKenzie extension protocol (centralization), neural mobilization, NSAIDs.",
          "Activity modification — avoid prolonged sitting, axial loading.",
          "Refer for persistent radiculopathy, progressive weakness, or red flags.",
        ],
      },
      {
        name: "Lumbar facet syndrome",
        evaluation: [
          "Lumbar facets oriented in sagittal plane → flex/ext but minimal rotation.",
          "Pain with extension + ipsilateral side-bend (Kemp test); paraspinal tenderness.",
          "Pain unilateral, worse with prolonged standing / extension, eases with flexion.",
        ],
        treatment: [
          "Manual therapy (mobilization), flexion-biased exercise, core stabilization.",
          "Avoid repeated extension positions until symptoms settle.",
        ],
      },
      {
        name: "Lumbar muscle strain",
        evaluation: [
          "Diffuse paraspinal pain after lifting / twisting; muscle guarding.",
          "Negative neuro screen; no radicular symptoms.",
        ],
        treatment: [
          "Acute: relative rest, ice 24–48 h, gentle ROM, NSAIDs short-term.",
          "Progress to lumbopelvic stabilization, hip mobility, return to sport-specific loading.",
        ],
      },
    ],
    highYield: [
      "Cauda equina (saddle anesthesia + bowel/bladder dysfunction) is a SURGICAL emergency — EMS NOW.",
      "Lumbar facets in the sagittal plane → flexion/extension yes, rotation NO (key vs thoracic).",
      "Adolescent extension-based athlete with low back pain = spondylolysis until proven otherwise.",
      "Centralization of pain with McKenzie extension = positive prognostic sign for disc.",
    ],
    topicNames: ["Spine Evaluation", "Therapeutic Exercise"],
  },
  {
    id: "hip",
    name: "Hip & Pelvis",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 70, y: 218, width: 60, height: 22,
    labelX: 14, labelY: 230, side: "front",
    blurb: "Hip pointer, labral tear, athletic pubalgia.",
    injuries: [
      {
        name: "Hip pointer (iliac crest contusion)",
        evaluation: ["Direct blow to iliac crest.", "Tender, ecchymosis, painful trunk rotation."],
        treatment: ["Ice, compression, donut padding, PROTECT iliac crest on RTP."],
      },
      {
        name: "Femoroacetabular impingement / labral tear",
        evaluation: ["FADIR (anterior impingement), FABER tests.", "MRA confirms labral pathology."],
        treatment: ["Activity modification, hip mobility, glute strengthening; arthroscopy if conservative fails."],
      },
    ],
    highYield: ["SCFE = adolescent hip / knee pain — non-weight-bearing referral."],
    topicNames: ["Lower Extremity Special Tests"],
  },
  {
    id: "thigh",
    name: "Thigh (Quad / Hamstring)",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 72, y: 240, width: 56, height: 80,
    labelX: 14, labelY: 280, side: "both",
    blurb: "Quad contusion, hamstring strain, myositis ossificans.",
    injuries: [
      {
        name: "Quadriceps contusion",
        evaluation: ["Direct blow to anterior thigh.", "Grade by knee flexion ROM at 12–24 h: mild >90°, mod 45–90°, severe <45°."],
        treatment: ["Immediate: ice in 120° knee flexion 20 min — REDUCES myositis ossificans risk.", "Crutches if ROM <45°."],
      },
      {
        name: "Hamstring strain",
        evaluation: ["Sudden posterior thigh pain during sprint.", "Palpate for defect; resisted knee flexion + hip extension."],
        treatment: ["Acute: PRICE 24–72 h.", "Eccentric (Nordic) hamstring strengthening; progressive running program before RTP."],
      },
    ],
    highYield: ["Wrap quad contusion in 120° flexion immediately to prevent myositis ossificans."],
    topicNames: ["Lower Extremity Special Tests", "Therapeutic Exercise"],
  },
  {
    id: "knee-r",
    name: "Right Knee",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 84, cy: 330, rx: 13, ry: 11,
    labelX: 14, labelY: 330, side: "front",
    blurb: "ACL, MCL, meniscus, patellofemoral.",
    injuries: [
      {
        name: "ACL tear",
        evaluation: [
          "Non-contact deceleration / pivoting + 'pop'.",
          "Lachman (most sensitive in acute), anterior drawer, pivot shift.",
          "Effusion within hours.",
        ],
        treatment: [
          "Hinged brace, crutches, control swelling.",
          "Pre-hab: full extension + quad activation BEFORE surgery.",
          "ACLR + supervised 9–12 mo rehab; symmetric strength + hop tests for RTP.",
        ],
        rtp: "Quad strength ≥90% LSI, single-leg hop battery ≥90%, psychological readiness (ACL-RSI).",
      },
      {
        name: "MCL sprain",
        evaluation: ["Valgus stress at 0° (capsular) and 30° (isolated MCL)."],
        treatment: ["Hinged brace, early ROM, progressive loading; isolated grade I–III usually conservative."],
      },
      {
        name: "Meniscus tear",
        evaluation: ["McMurray, Thessaly (most sensitive), joint-line tenderness."],
        treatment: ["Conservative for stable tears; arthroscopic repair vs partial meniscectomy depending on zone."],
      },
    ],
    highYield: [
      "Lachman > anterior drawer for acute ACL (no guarding).",
      "Female athletes: 4–6× ACL risk → neuromuscular training programs (FIFA 11+).",
    ],
    topicNames: ["Lower Extremity Special Tests", "Therapeutic Exercise"],
  },
  {
    id: "knee-l",
    name: "Left Knee",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 116, cy: 330, rx: 13, ry: 11,
    labelX: 186, labelY: 330, side: "front",
    blurb: "Mirror of right knee — bilateral comparison essential.",
    injuries: [{ name: "See Right Knee", evaluation: ["Same special tests."], treatment: ["Same protocols."] }],
    highYield: ["Always compare to uninvolved side."],
    topicNames: ["Lower Extremity Special Tests"],
  },
  {
    id: "shin",
    name: "Lower Leg / Shin",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 72, y: 345, width: 56, height: 75,
    labelX: 14, labelY: 380, side: "front",
    blurb: "MTSS, tibial stress fracture, compartment syndrome.",
    injuries: [
      {
        name: "Acute compartment syndrome",
        redFlags: ["6 P's: Pain out of proportion, Pallor, Paresthesia, Paralysis, Pulselessness (late), Poikilothermia"],
        evaluation: ["Tense compartment, pain w/ passive stretch.", "Compartment pressure measurement."],
        treatment: ["EMS — surgical fasciotomy within 6 h of onset."],
      },
      {
        name: "Tibial stress fracture",
        evaluation: ["Focal tibial tenderness, +tuning fork / hop test.", "MRI > bone scan for staging."],
        treatment: ["Anterior tibia ('dreaded black line') = high-risk → non-weight-bearing, possible surgery.", "Posteromedial: relative rest, gradual return."],
      },
    ],
    highYield: ["Anterior tibia stress fx = high-risk; female athlete triad screen."],
    topicNames: ["Lower Extremity Special Tests", "Therapeutic Modalities"],
  },
  {
    id: "ankle-r",
    name: "Right Ankle",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 84, cy: 425, rx: 11, ry: 8,
    labelX: 14, labelY: 425, side: "front",
    blurb: "Lateral sprain, high ankle, Achilles rupture.",
    injuries: [
      {
        name: "Lateral ankle sprain",
        evaluation: ["Inversion mechanism, ATFL most common.", "Anterior drawer (ATFL), talar tilt (CFL).", "Ottawa ankle rules for X-ray."],
        treatment: ["Functional rehab > immobilization: early protected WB, ROM, peroneal strengthening, BAPS / single-leg balance.", "Brace/tape on RTP."],
      },
      {
        name: "Achilles rupture",
        evaluation: ["Audible 'pop', gap palpable, +Thompson test (no plantarflexion w/ calf squeeze)."],
        treatment: ["Equinus immobilization, refer for surgical vs conservative consult; early functional rehab improves outcomes."],
      },
      {
        name: "High ankle sprain (syndesmosis)",
        evaluation: ["Squeeze, external rotation tests; pain ABOVE ankle joint.", "Longer recovery than lateral sprain."],
        treatment: ["Boot/NWB initially, gradual progression; surgical fixation if frank diastasis."],
      },
    ],
    highYield: ["Ottawa ankle rules: bony tenderness at posterior 6 cm of either malleolus OR navicular OR base of 5th MT OR inability to bear weight 4 steps → image."],
    topicNames: ["Lower Extremity Special Tests"],
  },
  {
    id: "ankle-l",
    name: "Left Ankle",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "ellipse", cx: 116, cy: 425, rx: 11, ry: 8,
    labelX: 186, labelY: 425, side: "front",
    blurb: "Mirror of right ankle.",
    injuries: [{ name: "See Right Ankle", evaluation: ["Same tests."], treatment: ["Same."] }],
    highYield: ["Bilateral evaluation always."],
    topicNames: ["Lower Extremity Special Tests"],
  },
  {
    id: "foot",
    name: "Foot",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 72, y: 445, width: 56, height: 22,
    labelX: 14, labelY: 455, side: "front",
    blurb: "Plantar fasciitis, Lisfranc, turf toe, 5th MT.",
    injuries: [
      {
        name: "Jones fracture (5th MT diaphysis)",
        evaluation: ["Lateral foot pain after inversion / cutting.", "Tenderness over base of 5th MT diaphysis (not styloid)."],
        treatment: ["NWB cast/boot — high non-union rate; many athletes elect IM screw fixation."],
      },
      {
        name: "Lisfranc injury",
        redFlags: ["plantar ecchymosis", "midfoot tenderness", "inability to bear weight"],
        evaluation: ["Weight-bearing AP/lateral/oblique X-rays — look for diastasis between 1st & 2nd MT bases.", "MRI/CT if X-rays negative but high suspicion."],
        treatment: ["NWB, refer; unstable / displaced require ORIF."],
      },
      {
        name: "Plantar fasciitis",
        evaluation: ["First-step morning heel pain; windlass test."],
        treatment: ["Calf + plantar fascia stretch, night splint, supportive footwear, gradual loading."],
      },
    ],
    highYield: ["Plantar ecchymosis = Lisfranc until proven otherwise."],
    topicNames: ["Lower Extremity Special Tests"],
  },

  // ===== POSTERIOR-ONLY REGIONS =====
  {
    id: "scapula",
    name: "Scapula & Posterior Shoulder",
    domain: "Assessment, Evaluation & Diagnosis",
    shape: "rect", x: 60, y: 100, width: 80, height: 30,
    labelX: 14, labelY: 115, side: "back",
    blurb: "Scapular dyskinesis, posterior RTC, snapping scapula.",
    injuries: [
      {
        name: "Scapular dyskinesis",
        evaluation: [
          "Observe scapulohumeral rhythm during forward flexion / abduction.",
          "Scapular Assistance Test (SAT) and Scapular Retraction Test (SRT).",
          "Kibler classification: Type I (inferior angle), II (medial border), III (superior).",
        ],
        treatment: [
          "Posterior capsule stretch (sleeper / cross-body).",
          "Serratus anterior + lower trap activation (wall slides, Y/T/W, prone Y).",
          "Address thoracic mobility and pec minor length.",
        ],
      },
      {
        name: "Infraspinatus / teres minor strain",
        evaluation: ["Resisted external rotation at 0° and 90° abduction.", "Posterior shoulder palpation tenderness."],
        treatment: ["Eccentric ER strengthening, scapular stabilization, gradual loading."],
      },
    ],
    highYield: [
      "Scapular dyskinesis predisposes to subacromial impingement and SLAP lesions.",
      "Always assess scapular control before progressing overhead athletes.",
    ],
    topicNames: ["Upper Extremity Special Tests", "Therapeutic Exercise"],
  },
  {
    id: "tspine",
    name: "Thoracic Spine",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 88, y: 130, width: 24, height: 60,
    labelX: 145, labelY: 160, side: "back",
    blurb: "T-spine hypomobility, Scheuermann's, rib dysfunction.",
    injuries: [
      {
        name: "Thoracic hypomobility",
        evaluation: [
          "Seated rotation ROM (target ≥45° each side).",
          "Prone press-up segmental extension assessment.",
        ],
        treatment: [
          "Foam roller extension mobilizations, open-book rotations, quadruped thread-the-needle.",
          "Address downstream effects on shoulder and lumbar mechanics.",
        ],
      },
      {
        name: "Rib dysfunction (post-trauma)",
        redFlags: ["sharp pleuritic pain", "dyspnea", "decreased breath sounds (rule out pneumothorax)"],
        evaluation: ["Palpate for step-off / crepitus.", "Compression test (AP and lateral)."],
        treatment: ["Pain control, deep breathing to prevent atelectasis; refer for imaging if red flags."],
      },
    ],
    highYield: [
      "T-spine mobility is a prerequisite for healthy overhead motion.",
      "Sudden chest pain after blunt thoracic trauma — rule out pneumothorax.",
    ],
    topicNames: ["Spine Evaluation", "Manual Therapy"],
  },
  {
    id: "glutes",
    name: "Glutes & SI Joint",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 70, y: 220, width: 60, height: 30,
    labelX: 14, labelY: 235, side: "back",
    blurb: "Glute weakness, SI dysfunction, piriformis syndrome.",
    injuries: [
      {
        name: "Gluteus medius weakness / Trendelenburg",
        evaluation: [
          "Single-leg stance: contralateral pelvic drop = positive Trendelenburg.",
          "Side-lying hip ABD MMT.",
        ],
        treatment: [
          "Side-lying clamshells, side-plank with hip ABD, monster walks, single-leg deadlift.",
          "Address lumbopelvic control and foot mechanics.",
        ],
      },
      {
        name: "Piriformis syndrome",
        evaluation: ["Deep buttock pain, +FAIR test (flexion, ADD, IR).", "Rule out lumbar radiculopathy first."],
        treatment: ["Piriformis stretch, soft-tissue release, glute and core strengthening."],
      },
      {
        name: "Sacroiliac joint dysfunction",
        evaluation: ["Cluster: distraction, compression, thigh thrust, Gaenslen's, sacral thrust — ≥3 positive."],
        treatment: ["Manual therapy, SI belt, lumbopelvic stabilization."],
      },
    ],
    highYield: [
      "Weak glute med drives a cascade of LE injury (PFPS, ITB, ankle).",
      "SI cluster requires ≥3 positive provocation tests for clinical relevance.",
    ],
    topicNames: ["Lower Extremity Special Tests", "Therapeutic Exercise", "Manual Therapy"],
  },
  {
    id: "hamstring-r",
    name: "Right Hamstring",
    domain: "Therapeutic Intervention",
    shape: "ellipse", cx: 84, cy: 285, rx: 14, ry: 30,
    labelX: 14, labelY: 285, side: "back",
    blurb: "Hamstring strain — sprinter (long head BF) vs stretch type.",
    injuries: [
      {
        name: "Hamstring strain (acute)",
        evaluation: [
          "Mechanism: high-speed running (BF long head) or extreme stretch (semimem).",
          "Palpate for defect, ecchymosis; resisted knee flexion + hip extension.",
          "Askling H-test for stretch-type injury.",
        ],
        treatment: [
          "Acute: PRICE 24–72 h, gentle ROM as tolerated.",
          "Eccentric Nordic hamstring program — best evidence for reinjury prevention.",
          "Progressive running: jog → stride → sprint with criterion-based progression.",
        ],
        rtp: "Painless full-effort sprint, ≥95% strength symmetry, completion of high-speed running progression.",
      },
    ],
    highYield: [
      "Reinjury rate is highest in first 2 weeks back — do NOT rush RTP.",
      "Nordic hamstring exercise reduces injury risk by ~50% across cohorts.",
    ],
    topicNames: ["Lower Extremity Special Tests", "Therapeutic Exercise"],
  },
  {
    id: "hamstring-l",
    name: "Left Hamstring",
    domain: "Therapeutic Intervention",
    shape: "ellipse", cx: 116, cy: 285, rx: 14, ry: 30,
    labelX: 186, labelY: 285, side: "back",
    blurb: "Mirror of right hamstring.",
    injuries: [{ name: "See Right Hamstring", evaluation: ["Same evaluation."], treatment: ["Same protocol."] }],
    highYield: ["Always compare to uninvolved side; symmetry is the RTP gate."],
    topicNames: ["Lower Extremity Special Tests", "Therapeutic Exercise"],
  },
  {
    id: "calf-r",
    name: "Right Calf",
    domain: "Therapeutic Intervention",
    shape: "ellipse", cx: 84, cy: 380, rx: 12, ry: 25,
    labelX: 14, labelY: 380, side: "back",
    blurb: "Gastroc strain, soleus strain, DVT screen.",
    injuries: [
      {
        name: "Gastrocnemius strain ('tennis leg')",
        evaluation: [
          "Sudden 'kicked in the calf' sensation, often medial gastroc.",
          "Palpable defect, +Thompson differentiates from Achilles rupture.",
          "Pain w/ resisted plantarflexion + knee extended.",
        ],
        treatment: [
          "Acute: PRICE, heel lift, crutches PRN.",
          "Progress to eccentric calf loading; gradual return to running.",
        ],
      },
      {
        name: "Deep vein thrombosis (DVT)",
        redFlags: ["unilateral calf swelling, warmth, redness", "Wells score ≥2", "recent immobilization / surgery"],
        evaluation: ["Wells criteria, NOT Homan's sign (low sensitivity).", "Refer for compression US."],
        treatment: ["Do NOT massage. Refer immediately for medical evaluation."],
      },
    ],
    highYield: [
      "Always rule out DVT in unilateral calf pain with swelling — Wells score guides referral.",
      "Thompson test (+ = no plantarflexion w/ calf squeeze) = Achilles rupture, NOT calf strain.",
    ],
    topicNames: ["Lower Extremity Special Tests"],
  },
  {
    id: "calf-l",
    name: "Left Calf",
    domain: "Therapeutic Intervention",
    shape: "ellipse", cx: 116, cy: 380, rx: 12, ry: 25,
    labelX: 186, labelY: 380, side: "back",
    blurb: "Mirror of right calf.",
    injuries: [{ name: "See Right Calf", evaluation: ["Same evaluation."], treatment: ["Same protocol."] }],
    highYield: ["Bilateral comparison essential; rule out DVT for unilateral swelling."],
    topicNames: ["Lower Extremity Special Tests"],
  },
  {
    id: "achilles",
    name: "Achilles Tendon",
    domain: "Therapeutic Intervention",
    shape: "rect", x: 75, y: 425, width: 50, height: 16,
    labelX: 14, labelY: 433, side: "back",
    blurb: "Achilles tendinopathy, rupture, retrocalcaneal bursitis.",
    injuries: [
      {
        name: "Achilles tendinopathy",
        evaluation: [
          "Insertional vs mid-portion (2–6 cm above calcaneus) — different rehab.",
          "VISA-A score for severity tracking.",
          "Painful arc with palpation; pain w/ single-leg heel raise.",
        ],
        treatment: [
          "Mid-portion: Alfredson eccentric heel-drop protocol (3×15 bent + straight knee, BID, 12 wk).",
          "Insertional: Silbernagel program (avoid full dorsiflexion); heel lift.",
          "Address calf flexibility, foot mechanics, training load.",
        ],
      },
      {
        name: "Achilles rupture",
        redFlags: ["audible 'pop'", "sudden severe calf pain", "inability to rise on toes"],
        evaluation: [
          "+Thompson test (no plantarflexion w/ calf squeeze) — most reliable.",
          "Palpable gap 2–6 cm above insertion.",
        ],
        treatment: [
          "Equinus immobilization, NWB, urgent orthopedic referral.",
          "Surgical vs conservative — both with early functional rehab improve outcomes.",
        ],
        rtp: "9–12 mo; symmetric calf circumference, single-leg heel-raise endurance, hop tests.",
      },
    ],
    highYield: [
      "Thompson test is the most sensitive Achilles rupture test — don't rely on ROM alone (FHL can mimic).",
      "Eccentric loading (Alfredson) is the gold-standard tendinopathy protocol.",
    ],
    topicNames: ["Lower Extremity Special Tests", "Therapeutic Exercise"],
  },

  // ===== WHOLE-BODY: SKIN & SOFT TISSUE (Ch 28) =====
  {
    id: "skin",
    name: "Skin & Soft Tissue",
    domain: "Risk Reduction, Wellness & Health Literacy",
    shape: "ellipse", cx: 178, cy: 205, rx: 12, ry: 14,
    labelX: 186, labelY: 205, side: "both",
    blurb: "Bacterial / fungal / viral / parasitic infections, environmental, wounds, melanoma screen.",
    injuries: [
      {
        name: "Bacterial: MRSA / impetigo / furuncle",
        redFlags: [
          "rapidly spreading erythema with streaking (lymphangitis)",
          "fever / systemic symptoms",
          "purulent abscess >5 cm or refractory to oral abx",
          "necrotizing soft-tissue infection signs (pain out of proportion, crepitus, bullae)",
        ],
        evaluation: [
          "MRSA: warm, tender, fluctuant 'spider-bite' lesion; common in wrestlers, football, MMA.",
          "Impetigo: honey-colored crusted lesions, highly contagious.",
          "Furuncle / carbuncle: deep follicular abscess; check for cluster.",
        ],
        treatment: [
          "I&D for fluctuant abscess + culture; oral abx per culture (TMP-SMX, doxycycline, clindamycin for MRSA).",
          "NCAA / NFHS RTP: covered + on systemic abx ≥72 h, no new lesions ×48 h, no moist/draining lesions; lesion must be coverable.",
          "Disinfect mats, equipment, towels; no shared bottles or razors.",
        ],
      },
      {
        name: "Fungal: tinea corporis ('ringworm') / pedis / cruris",
        evaluation: [
          "Annular scaly plaque with central clearing (corporis); maceration between toes (pedis); inguinal sparing of scrotum (cruris).",
          "KOH prep confirms hyphae if uncertain.",
        ],
        treatment: [
          "Topical antifungal (terbinafine, clotrimazole) ×2–4 wk; tinea capitis needs oral griseofulvin/terbinafine.",
          "Wrestling RTP: ≥72 h topical (skin) or ≥14 d oral (scalp), lesion coverable with bio-occlusive dressing.",
          "Keep skin dry; rotate footwear; no shared towels.",
        ],
      },
      {
        name: "Viral: herpes gladiatorum / molluscum / verruca",
        redFlags: ["primary HSV with systemic symptoms", "ocular involvement (HSV keratitis) — ophthalmology"],
        evaluation: [
          "HSV gladiatorum: clustered vesicles on erythematous base, prodromal tingling; common on head/neck of wrestlers.",
          "Molluscum: pearly umbilicated papules.",
          "Verruca (HPV): plantar / common warts, thrombosed capillaries.",
        ],
        treatment: [
          "HSV: oral acyclovir / valacyclovir (treatment AND prophylaxis during season).",
          "RTP for HSV (NCAA): ≥120 h on antiviral, no new lesions ×72 h, all lesions crusted; NOT coverable — must clear.",
          "Molluscum: curettage, cantharidin, cryotherapy; can compete if covered.",
          "Verruca: salicylic acid, cryotherapy, duct tape; pad plantar lesions.",
        ],
      },
      {
        name: "Parasitic: scabies / pediculosis (lice)",
        evaluation: [
          "Scabies: intense nighttime itching, burrows in web spaces, wrists, axillae, waistline.",
          "Pediculosis: nits cemented to hair shaft.",
        ],
        treatment: [
          "Scabies: 5% permethrin head-to-toe ×8–14 h, repeat in 1 wk; treat all close contacts; wash linens hot.",
          "Lice: 1% permethrin or pyrethrin to scalp; nit comb; treat shared headgear.",
          "RTP after first treatment + lesions covered.",
        ],
      },
      {
        name: "Environmental: sunburn / frostbite / friction blister",
        redFlags: [
          "frostbite with hard waxy white skin or hemorrhagic bullae (deep / 3rd–4th degree)",
          "sunburn with blistering >20% BSA, fever, dehydration → ED",
        ],
        evaluation: [
          "Frostbite stages: frostnip (reversible), superficial (clear blisters), deep (hemorrhagic blisters, hard tissue).",
          "Burn depth: 1st (erythema), 2nd (blisters, painful), 3rd (charred / painless).",
          "Friction blister: shear injury at high-pressure points.",
        ],
        treatment: [
          "Frostbite: rapid rewarming in 99–102 °F (37–39 °C) circulating water 15–30 min — ONLY if no risk of refreeze. No rubbing, no dry heat.",
          "Sunburn: cool compresses, aloe, NSAIDs, hydration; avoid breaking blisters.",
          "Friction blister: leave roof intact; if drained, sterile puncture at edge, antibiotic ointment, donut pad.",
          "Prevention: SPF ≥30 broad-spectrum reapplied q2h, moisture-wicking socks, blister-prone area lubrication.",
        ],
      },
      {
        name: "Wounds: abrasion / laceration / puncture",
        redFlags: ["wound through tendon / joint capsule", "high-pressure injection injury", "tetanus-prone wound + no booster ≥5 yr", "human/animal bite (high infection risk)"],
        evaluation: [
          "Assess depth, NV status distally, foreign body, contamination.",
          "Lacerations >½ in or gaping → physician for closure within 6–8 h (face up to 24 h).",
        ],
        treatment: [
          "Standard precautions: gloves, irrigate copiously with saline / potable water (≥250 mL).",
          "Cleanse with mild soap; antibiotic ointment; non-adherent dressing.",
          "Bloodborne pathogen exposure → OSHA reporting + post-exposure protocol per EAP.",
          "Tetanus booster if last >5 yr (clean wound) or >10 yr (any wound).",
        ],
      },
      {
        name: "Suspicious mole / melanoma screen",
        redFlags: ["any ABCDE-positive lesion", "rapid change in size, color, bleeding, or symptoms"],
        evaluation: [
          "ABCDEs: Asymmetry, Border irregularity, Color variation, Diameter >6 mm, Evolving.",
          "Inspect skin during PPE / sport physicals; high UV exposure → higher risk.",
          "Melanoma is the deadliest skin cancer; early detection drives survival.",
        ],
        treatment: [
          "Refer ANY ABCDE-positive lesion to dermatology for biopsy.",
          "Counsel sun protection: SPF ≥30, reapply q2h, hat / UPF clothing, avoid peak UV.",
        ],
      },
      {
        name: "Acute / chronic dermatitis (contact, eczema, miliaria)",
        evaluation: [
          "Contact: localized erythema / vesicles in pattern of exposure (tape, neoprene, latex, plant).",
          "Atopic eczema: flexural dry pruritic plaques.",
          "Miliaria ('heat rash'): tiny vesicles on occluded skin in heat.",
        ],
        treatment: [
          "Identify and remove offending agent; barrier creams; hypoallergenic tape.",
          "Topical steroids short-term; emollients for eczema.",
          "Cool environment, breathable fabrics for miliaria.",
        ],
      },
    ],
    highYield: [
      "ABCDEs of melanoma — any positive finding = dermatology referral.",
      "MRSA RTP: covered + on abx ≥72 h, no new lesions ×48 h, no draining/moist lesions.",
      "HSV gladiatorum RTP (NCAA wrestling): ≥120 h antiviral, no new lesions ×72 h, all lesions crusted; NOT coverable.",
      "Frostbite: rapid rewarming 99–102 °F water; do NOT thaw if risk of refreeze (worse than staying frozen).",
      "Honey-colored crust = impetigo (Strep / Staph); highly contagious.",
      "Standard precautions assume ALL body fluids are infectious — gloves + irrigation + dressing for every wound.",
    ],
    topicNames: ["Pharmacology", "Professional Standards"],
  },
];
