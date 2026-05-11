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
  },
];
