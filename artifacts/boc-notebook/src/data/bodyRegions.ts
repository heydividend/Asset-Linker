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
    blurb: "Concussion, skull fx, facial injuries.",
    injuries: [
      {
        name: "Sport-related concussion",
        redFlags: ["LOC > 30 s", "GCS < 15", "worsening HA", "repeated vomiting", "seizure", "focal neuro deficit"],
        evaluation: [
          "Remove from play immediately — when in doubt, sit them out.",
          "SCAT6 (≥13 yr) or Child SCAT6 (5–12 yr) sideline assessment.",
          "Symptom checklist, cognitive screen, mBESS, tandem gait.",
          "Refer to physician for any red flag or persistent symptoms.",
        ],
        treatment: [
          "24–48 h relative rest, then sub-symptom-threshold aerobic activity.",
          "Stepwise 6-stage RTP progression — 24 h between stages.",
          "No same-day return to play in any organized sport.",
          "Academic accommodations during symptomatic phase.",
        ],
        rtp: "Symptom-free at rest AND through full progression AND medical clearance.",
      },
    ],
    highYield: [
      "SCAT6 replaced SCAT5 in 2023 (Amsterdam Consensus).",
      "Second-impact syndrome → diffuse cerebral edema, often fatal.",
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
    blurb: "C-spine sprain, stinger, suspected fracture.",
    injuries: [
      {
        name: "Suspected cervical fracture",
        redFlags: ["midline tenderness", "neuro deficit", "altered mental status", "distracting injury"],
        evaluation: [
          "Manual in-line stabilization — head squeeze, do NOT remove helmet on field.",
          "Spine-boarding with log-roll or 6+ plus lift technique.",
          "Activate EMS; transport with hard collar.",
        ],
        treatment: [
          "Field: immobilize, transport to trauma center.",
          "Helmet/shoulder pads off TOGETHER (current consensus) once at facility.",
          "NEXUS / Canadian C-Spine rule for clearance imaging.",
        ],
      },
      {
        name: "Brachial plexus stinger / burner",
        evaluation: ["Unilateral arm burning, weakness, NO neck pain.", "Resolves in seconds–minutes."],
        treatment: ["Hold from contact until full strength + painless ROM.", "Bilateral sx → treat as c-spine until cleared."],
      },
    ],
    highYield: [
      "Bilateral upper-extremity sx after impact = c-spine until proven otherwise.",
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
    blurb: "Commotio cordis, pneumothorax, rib fracture, SCA.",
    injuries: [
      {
        name: "Commotio cordis",
        redFlags: ["sudden collapse after blunt chest impact", "pulseless"],
        evaluation: ["Witnessed blunt impact during T-wave repolarization → immediate VF.", "Check responsiveness, breathing, pulse."],
        treatment: ["Activate EMS, start CPR, AED ASAP — single most important predictor of survival is time to defibrillation.", "Continue until ROSC or EMS arrival."],
      },
      {
        name: "Tension pneumothorax",
        redFlags: ["tracheal deviation AWAY from injury", "absent breath sounds", "JVD", "shock"],
        evaluation: ["Sudden dyspnea after blow / rib fx.", "Hyperresonance on percussion."],
        treatment: ["EMS now — decompression by physician (2nd ICS midclavicular)."],
      },
    ],
    highYield: [
      "AED < 3 min from collapse = >90% survival in commotio cordis.",
      "Every venue EAP must define AED location and time-to-shock target.",
    ],
    topicNames: ["Cardiopulmonary Emergencies", "Emergency Action Plans"],
  },
  {
    id: "abdomen",
    name: "Abdomen",
    domain: "Critical Incident Management",
    shape: "rect", x: 80, y: 150, width: 40, height: 38,
    labelX: 14, labelY: 170, side: "front",
    blurb: "Splenic / liver / kidney injury, hernia.",
    injuries: [
      {
        name: "Splenic rupture",
        redFlags: ["LUQ pain", "Kehr sign (referred L shoulder)", "hypotension", "abdominal rigidity"],
        evaluation: ["Mechanism: blunt LUQ trauma, esp. in mononucleosis-enlarged spleen.", "FAST exam at hospital."],
        treatment: ["Activate EMS — surgical emergency.", "NPO, monitor vitals, prepare for shock."],
      },
    ],
    highYield: ["Mono → no contact for ≥3 wk from sx onset; spleen palpation unreliable, US imaging preferred."],
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
    blurb: "Strain, spondylolysis, disc herniation.",
    injuries: [
      {
        name: "Spondylolysis",
        evaluation: ["Adolescent extension-based athletes.", "Stork (single-leg hyperextension) test.", "MRI > bone scan > CT for staging."],
        treatment: ["Rest from extension activities 4–6 wk, anti-lordotic brace, core/glute strengthening."],
      },
      {
        name: "Lumbar disc herniation",
        redFlags: ["saddle anesthesia", "bowel/bladder dysfunction (cauda equina) — EMS"],
        evaluation: ["SLR / slump test, dermatomal sensory and reflex testing."],
        treatment: ["Conservative: McKenzie extension, neural mobilization, NSAIDs.", "Refer if neuro deficit or red flags."],
      },
    ],
    highYield: ["Cauda equina is a SURGICAL emergency — recognize and refer."],
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
];
