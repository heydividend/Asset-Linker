/**
 * BOC item-writing style linter.
 *
 * Encodes the machine-checkable rules from the official "BOC Exam Development
 * Style Guide" (Aug 2025) and flags questions in the bank that violate them, so
 * imported textbook items and generated items can be audited and brought in line
 * with how the real exam asks questions. Report-only by default; this never
 * rewrites medical content.
 *
 * Operates on the JSON bank files (no DB / no AI), so it runs anywhere.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts exec tsx ./src/lintQuestions.ts [files...] [flags]
 *
 *   files...        bank JSON files (default: every *.json in scripts/data/)
 *   --rule R        only report rule R (repeatable); default: all
 *   --examples N    show up to N example items per rule (default 3)
 *   --json PATH     also write the full findings list to PATH
 *
 * Each rule maps to a Style-Guide section; see RULES below.
 */
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const DATA_DIR = path.resolve(import.meta.dirname, "..", "data");

type RawQuestion = { stem?: string; choices?: string[]; rationale?: string };
type Finding = { file: string; index: number; rule: string; detail: string; stem: string };

type Rule = {
  id: string;
  guide: string; // Style-Guide reference
  desc: string;
  check: (q: RawQuestion) => string | null; // returns a detail string if violated
};

const choicesText = (q: RawQuestion) => (q.choices ?? []).join(" || ");

const RULES: Rule[] = [
  {
    id: "stem-question-mark",
    guide: "§1.G",
    desc: "Items must be written as a question and end in '?' (no fill-in-the-blank).",
    check: (q) => {
      // Strip a trailing standard instruction (BOC §3.N) before checking, so
      // "…dangers? Select all that apply." is not falsely flagged.
      const s = (q.stem ?? "")
        .trim()
        .replace(/\b(select|choose) all that apply\.?$/i, "")
        .replace(/\bchoose only one\.?$/i, "")
        .trim();
      if (!s) return null;
      return s.endsWith("?") ? null : "stem is a statement / fill-in-the-blank (not a question)";
    },
  },
  {
    id: "negative-stem",
    guide: "§1.K",
    desc: "State items positively — avoid EXCEPT / NOT / 'all of the following' / 'least likely'.",
    check: (q) => {
      const s = q.stem ?? "";
      if (/\bEXCEPT\b/i.test(s)) return "contains 'EXCEPT'";
      if (/\bNOT\b/.test(s)) return "contains emphasized 'NOT'";
      if (/\ball of the following\b/i.test(s)) return "uses 'all of the following'";
      if (/\bleast likely\b/i.test(s)) return "uses 'least likely'";
      if (/\bis not (true|correct)\b/i.test(s)) return "negative 'is not true/correct'";
      return null;
    },
  },
  {
    id: "absurd-meta-options",
    guide: "§1.P",
    desc: "Avoid 'all of the above', 'none of the above', 'a and b', 'I don't know'.",
    check: (q) => {
      for (const c of q.choices ?? []) {
        const t = c.trim().toLowerCase();
        if (/^all of the above\.?$/.test(t)) return "'all of the above' option";
        if (/^none of the above\.?$/.test(t)) return "'none of the above' option";
        if (/^both [a-e] and [a-e]\b/.test(t) || /^[a-e] and [a-e] (above|only)\b/.test(t)) return "'a and b'-style option";
        if (/i don'?t know/.test(t)) return "'I don't know' option";
      }
      return null;
    },
  },
  {
    id: "second-person",
    guide: "§1.I",
    desc: "Write in third person ('An athletic trainer would…'), not 'you'.",
    check: (q) => (/\b(you|your|yourself)\b/i.test(q.stem ?? "") ? "stem uses second person ('you')" : null),
  },
  {
    id: "terminology",
    guide: "§3.C",
    desc: "Use BOC-preferred terminology.",
    check: (q) => {
      const s = q.stem ?? "";
      const pairs: [RegExp, string][] = [
        [/\bcertified athletic trainer\b/i, "use 'athletic trainer' (not 'certified athletic trainer')"],
        [/\bdoctor\b/i, "use 'physician' (not 'doctor')"],
        [/\bathletic training room\b/i, "use 'athletic training facility' (not 'room')"],
        [/\bNATA[- ]?BOC\b/i, "use 'BOC' (not 'NATABOC')"],
        [/\borthopaedic\b/i, "use 'orthopedic'"],
        [/\bredness\b/i, "use 'erythema/pallor' (skin-tone-neutral), not 'redness'"],
      ];
      for (const [re, msg] of pairs) if (re.test(s)) return msg;
      return null;
    },
  },
  {
    id: "gendered-pronoun",
    guide: "§2.C",
    desc: "Use they/them/their unless sex is clinically required.",
    check: (q) => (/\b(he|she|his|her|him)\b/i.test(q.stem ?? "") ? "uses gendered pronoun — prefer they/them unless sex is required" : null),
  },
  {
    id: "leading-zero",
    guide: "§4.B",
    desc: "Insert a leading zero on decimals < 1 (0.4, not .4).",
    check: (q) => ((/(?:^|\s)\.\d/.test(q.stem ?? "") || /(?:^|\s)\.\d/.test(choicesText(q))) ? "decimal missing leading zero" : null),
  },
  {
    id: "spinal-segment",
    guide: "§4.D",
    desc: "Spinal segments take no hyphen/space (C4, not C-4 or C 4).",
    check: (q) => {
      const both = `${q.stem ?? ""} ${choicesText(q)}`;
      return /\b[CTLS][- ]\d\b/.test(both) ? "spinal segment written with hyphen/space" : null;
    },
  },
  {
    id: "two-concepts",
    guide: "§1.F",
    desc: "One concept per item — avoid '… and what should be done next?'.",
    check: (q) => (/\band (then )?what (should|would|is the next)\b/i.test(q.stem ?? "") || /\? *and\b/i.test(q.stem ?? "") ? "stem appears to test two concepts" : null),
  },
  {
    id: "choice-length-cue",
    guide: "§1.L",
    desc: "Distractors should be consistent in length (no long-correct-answer cue).",
    check: (q) => {
      const lens = (q.choices ?? []).map((c) => c.trim().length).filter((n) => n > 0);
      if (lens.length < 3) return null;
      const max = Math.max(...lens), min = Math.min(...lens);
      return max >= 4 * min && max - min > 40 ? `choice length varies widely (${min}–${max} chars)` : null;
    },
  },
];

function parseArgs(argv: string[]) {
  const args = { files: [] as string[], rules: [] as string[], examples: 3, json: "" };
  const rest = argv.slice(2);
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === "--") continue;
    else if (a === "--rule") args.rules.push(rest[++i] ?? "");
    else if (a === "--examples") args.examples = Math.max(0, Number(rest[++i]) || 3);
    else if (a === "--json") args.json = path.resolve(rest[++i] ?? "");
    else if (!a.startsWith("--")) args.files.push(path.resolve(a));
    else throw new Error(`Unknown flag: ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  let files = args.files;
  if (files.length === 0) {
    const entries = await readdir(DATA_DIR).catch(() => [] as string[]);
    files = entries.filter((f) => f.toLowerCase().endsWith(".json")).map((f) => path.join(DATA_DIR, f)).sort();
  }
  if (files.length === 0) { console.log(`No bank files found in ${DATA_DIR}.`); return; }

  const activeRules = args.rules.length ? RULES.filter((r) => args.rules.includes(r.id)) : RULES;
  const findings: Finding[] = [];
  let total = 0;
  for (const f of files) {
    const arr = JSON.parse(await readFile(f, "utf8")) as RawQuestion[];
    total += arr.length;
    arr.forEach((q, index) => {
      for (const r of activeRules) {
        const detail = r.check(q);
        if (detail) findings.push({ file: path.basename(f), index, rule: r.id, detail, stem: (q.stem ?? "").slice(0, 100) });
      }
    });
  }

  // Report.
  console.log(`Linted ${total} questions across ${files.length} file(s) against ${activeRules.length} BOC style rules.\n`);
  const byRule = new Map<string, Finding[]>();
  for (const fnd of findings) (byRule.get(fnd.rule) ?? byRule.set(fnd.rule, []).get(fnd.rule)!).push(fnd);
  const flagged = new Set(findings.map((f) => `${f.file}#${f.index}`));
  console.log(`Items with ≥1 finding: ${flagged.size} / ${total}   (${findings.length} findings total)\n`);

  for (const r of activeRules) {
    const fs = byRule.get(r.id) ?? [];
    console.log(`[${fs.length.toString().padStart(4)}]  ${r.id}  (${r.guide}) — ${r.desc}`);
    for (const ex of fs.slice(0, args.examples)) {
      console.log(`        • ${ex.detail}: "${ex.stem}${ex.stem.length >= 100 ? "…" : ""}"  (${ex.file}#${ex.index})`);
    }
  }

  if (args.json) {
    await writeFile(args.json, JSON.stringify(findings, null, 2));
    console.log(`\nFull findings written to ${args.json}`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
