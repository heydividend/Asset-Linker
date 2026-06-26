// Official BOC Practice Analysis 8th Edition (PA8) content outline.
// Source: "Content Outline for Practice Analysis, 8th Edition" (effective
// Athletic Trainer Exam March 2023). Verbatim domain descriptions and the 23
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

// Compact text block for grounding the AI Tutor in the official blueprint.
export function pa8BlueprintText(): string {
  const byDomain = new Map<string, Pa8Task[]>();
  for (const t of PA8_TASKS) {
    const list = byDomain.get(t.domain) ?? [];
    list.push(t);
    byDomain.set(t.domain, list);
  }
  const lines: string[] = ["OFFICIAL BOC PRACTICE ANALYSIS 8th EDITION (PA8) BLUEPRINT:"];
  for (const code of ["D1", "D2", "D3", "D4", "D5"]) {
    lines.push(`\n${code}: ${PA8_DOMAIN_DESCRIPTIONS[code]}`);
    for (const t of byDomain.get(code) ?? []) {
      lines.push(`  ${t.code} — ${t.statement}`);
    }
  }
  return lines.join("\n");
}
