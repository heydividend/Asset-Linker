// Official BOC Practice Analysis 8th Edition (PA8) content outline.
// Source: "Content Outline for Practice Analysis, 8th Edition" (effective
// Athletic Trainer Exam March 2023). Verbatim domain descriptions and the 25
// task statements that make up the exam blueprint. Single source of truth for
// seeding, AI Tutor grounding, and question→task classification.

export const PA8_DOMAIN_DESCRIPTIONS: Record<string, string> = {
  D1: "Promoting healthy lifestyle behaviors with effective education and communication to enhance wellness and minimize the risk of injury and illness.",
  D2: "Implementing systematic, evidence-based assessments and evaluations to formulate valid clinical diagnoses and differential diagnoses to determine a patient's plan of care.",
  D3: "Integrating best practices in immediate and emergency care for optimal outcomes.",
  D4: "Rehabilitating individuals with a health condition (i.e., injury, illness, general medical condition) with the goal of achieving optimal activity and participation levels based on core concepts (i.e., fundamental knowledge and skillsets) using the applications of therapeutic exercise, modality devices, and manual techniques.",
  D5: "Integrating best practices in policy construction and implementation, documentation and basic business practices to promote optimal patient care and employee well-being.",
};

export interface Pa8Task {
  code: string;
  domain: string;
  statement: string;
}

export const PA8_TASKS: Pa8Task[] = [
  { code: "0101", domain: "D1", statement: "Identify risk factors by administering assessment, pre-participation examination and other screening instruments, and reviewing individual and group history and surveillance data." },
  { code: "0102", domain: "D1", statement: "Implement plans to aid in risk reduction in accordance with evidence-based practice and applicable guidelines." },
  { code: "0103", domain: "D1", statement: "Promote health literacy by educating patients and other stakeholders in order to improve their capacity to obtain, process, and understand basic health information needed to make appropriate health decisions." },
  { code: "0104", domain: "D1", statement: "Optimize wellness (e.g., social, emotional, spiritual, environmental, occupational, intellectual, physical) for individuals and groups." },
  { code: "0105", domain: "D1", statement: "Facilitate individual and group safety by monitoring and responding to environmental conditions (e.g., weather, surfaces, and work setting)." },
  { code: "0201", domain: "D2", statement: "Obtain a thorough and individualized history using observation and appropriate interview techniques to identify information relevant to the patient's current condition." },
  { code: "0202", domain: "D2", statement: "Perform a physical examination using appropriate diagnostic techniques." },
  { code: "0203", domain: "D2", statement: "Formulate a clinical diagnosis by interpreting the information obtained during the history and physical examination." },
  { code: "0204", domain: "D2", statement: "Establish a plan of care based on the clinical diagnosis and evidence-based practice." },
  { code: "0205", domain: "D2", statement: "Educate the patient and stakeholders on the clinical diagnosis, prognosis, and plan of care." },
  { code: "0301", domain: "D3", statement: "Implement Emergency Action (Response) Plans for all venues and events to guide appropriate and unified response in order to optimize outcomes." },
  { code: "0302", domain: "D3", statement: "Triage the severity of health conditions." },
  { code: "0303", domain: "D3", statement: "Implement appropriate evidence-based emergent care procedures to reduce the risk of morbidity and mortality (e.g., c-spine, airway management, heat illness, pandemics, suicides, other emergent conditions)." },
  { code: "0304", domain: "D3", statement: "Assess the scene to identify appropriate courses of action." },
  { code: "0401", domain: "D4", statement: "Optimize patient outcomes by developing, evaluating, and updating the plan of care." },
  { code: "0402", domain: "D4", statement: "Educate patients and appropriate stakeholders using pertinent information to optimize patient-centered care and patient engagement throughout the therapeutic intervention process." },
  { code: "0403", domain: "D4", statement: "Prescribe therapeutic exercises following evidence-based practices to address impairments and enhance activity and participation levels." },
  { code: "0404", domain: "D4", statement: "Administer therapeutic modalities and devices using evidence-based procedures and parameters to address impairments and enhance activity and participation levels." },
  { code: "0405", domain: "D4", statement: "Administer manual therapy techniques using evidence-based methods to address impairments and enhance activity and participation levels." },
  { code: "0406", domain: "D4", statement: "Determine patients' functional status using appropriate techniques and standards to inform decisions about returning to optimal activity and participation levels." },
  { code: "0407", domain: "D4", statement: "Manage general medical conditions to optimize activity and participation levels." },
  { code: "0501", domain: "D5", statement: "Assess organizational and individual outcomes using quality improvement analyses." },
  { code: "0502", domain: "D5", statement: "Develop policies, procedures, and plans to address organizational needs." },
  { code: "0503", domain: "D5", statement: "Practice within federal, state, and local laws, regulations, rules, requirements, and professional standards." },
  { code: "0504", domain: "D5", statement: "Use standardized documentation procedures to ensure best practices." },
];

// Official share of the exam (and survey weighting) carried by each domain, per
// the PA8 report. Matches the seeded domain weights; used for grounding and to
// help prioritize study toward the heaviest-weighted domains.
export const PA8_DOMAIN_WEIGHTS: Record<string, number> = {
  D1: 0.2,
  D2: 0.256,
  D3: 0.208,
  D4: 0.256,
  D5: 0.08,
};

export interface Pa8TaskRating {
  // Mean Importance on the PA8 1–4 harm scale (4 = extreme harm if performed
  // poorly) — how critical it is that a newly certified AT performs the task well.
  importance: number;
  // Mean Frequency on the PA8 1–5 scale (5 = repeatedly) — how often newly
  // certified ATs actually perform the task in practice.
  frequency: number;
}

// Per-task Importance and Frequency means from the PA8 descriptive-statistics
// tables. Powers study prioritization ("what to study first") and weighted drills.
export const PA8_TASK_RATINGS: Record<string, Pa8TaskRating> = {
  "0101": { importance: 3.1, frequency: 3.1 },
  "0102": { importance: 2.9, frequency: 3.4 },
  "0103": { importance: 2.2, frequency: 3.1 },
  "0104": { importance: 2.6, frequency: 4.0 },
  "0105": { importance: 3.4, frequency: 4.3 },
  "0201": { importance: 3.3, frequency: 4.7 },
  "0202": { importance: 3.3, frequency: 4.6 },
  "0203": { importance: 3.3, frequency: 4.8 },
  "0204": { importance: 3.2, frequency: 4.7 },
  "0205": { importance: 2.9, frequency: 4.6 },
  "0301": { importance: 3.7, frequency: 2.8 },
  "0302": { importance: 3.7, frequency: 3.4 },
  "0303": { importance: 3.8, frequency: 2.9 },
  "0304": { importance: 3.5, frequency: 3.4 },
  "0401": { importance: 2.7, frequency: 4.4 },
  "0402": { importance: 2.5, frequency: 4.3 },
  "0403": { importance: 2.9, frequency: 4.6 },
  "0404": { importance: 3.0, frequency: 4.5 },
  "0405": { importance: 2.9, frequency: 4.5 },
  "0406": { importance: 3.2, frequency: 4.5 },
  "0407": { importance: 3.1, frequency: 4.1 },
  "0501": { importance: 2.1, frequency: 3.1 },
  "0502": { importance: 2.4, frequency: 2.6 },
  "0503": { importance: 3.4, frequency: 4.5 },
  "0504": { importance: 2.9, frequency: 4.7 },
};

// Compact text block for grounding the AI Tutor and question generation in the
// official blueprint, including exam weighting and per-task importance/frequency.
export function pa8BlueprintText(): string {
  const byDomain = new Map<string, Pa8Task[]>();
  for (const t of PA8_TASKS) {
    const list = byDomain.get(t.domain) ?? [];
    list.push(t);
    byDomain.set(t.domain, list);
  }
  const lines: string[] = [
    "OFFICIAL BOC PRACTICE ANALYSIS 8th EDITION (PA8) BLUEPRINT:",
    "(Importance scale 1–4 = how much harm if done poorly; Frequency scale 1–5 = how often performed.)",
  ];
  for (const code of ["D1", "D2", "D3", "D4", "D5"]) {
    const pct = Math.round((PA8_DOMAIN_WEIGHTS[code] ?? 0) * 1000) / 10;
    lines.push(`\n${code} (${pct}% of exam): ${PA8_DOMAIN_DESCRIPTIONS[code]}`);
    for (const t of byDomain.get(code) ?? []) {
      const r = PA8_TASK_RATINGS[t.code];
      const rating = r ? ` [importance ${r.importance}/4, frequency ${r.frequency}/5]` : "";
      lines.push(`  ${t.code} — ${t.statement}${rating}`);
    }
  }
  return lines.join("\n");
}
