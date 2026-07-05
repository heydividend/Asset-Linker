# Athletic Training (BOC) Practice Question Bank

Board of Certification–style practice questions for athletic training, extracted from
source screenshots and expanded with pattern-matched generated items.

Generated: 2026-07-05

## Contents

| File | What it is |
|------|-----------|
| `question_bank.json` | **Master file** — metadata + all 155 questions with answer keys |
| `extracted_questions.json` | 95 questions OCR'd from the `.snagx` screenshots |
| `generated_questions.json` | 60 new questions written to match the extracted pattern |
| `../extracted_png/` | The 102 source PNGs (unzipped from the `.snagx` captures) |
| `../ocr_output/` | Raw per-batch OCR output (intermediate) |
| `../bank_work/` | Intermediate answer-keying / generation output |

## How this was built

1. **Convert** — each `.snagx` (Snagit capture, a zip) was unzipped and its full-resolution
   PNG extracted to `extracted_png/` (106 captures → 102 unique images).
2. **OCR** — every image was transcribed: stem, options, question type, domain.
   All 102 turned out to be quiz questions (no app screenshots in the set).
3. **De-duplicate** — near-identical captures collapsed to 95 unique questions.
4. **Answer-key** — a correct answer + short explanation was determined for every question.
   Only one source image (`...12-14-04`, conventional TENS) and the graded leg-alignment
   fill-in actually showed the answer on screen; the rest were derived from standard
   athletic-training references and flagged with an `answer_confidence` of `high` or `medium`.
5. **Generate** — 60 new questions (12 per domain) were written to mirror the style,
   type mix, and difficulty of the extracted set.

## Domains (BOC practice analysis)

| ID | Domain |
|----|--------|
| I | Injury/Illness Prevention & Wellness Protection |
| II | Clinical Evaluation & Diagnosis |
| III | Immediate & Emergency Care |
| IV | Treatment & Rehabilitation |
| V | Organizational & Professional Health & Well-being |

## Counts

- **Total: 155** (95 extracted + 60 generated)
- By domain: I=28, II=33, III=31, IV=30, V=33
- By type: multiple_choice_single=101, true_false=24, multiple_choice_multi=14,
  scenario=13, ordering=2, fill_in=1

## Question schema

```json
{
  "id": "AT-EX-001",              // AT-EX-* = extracted, AT-GEN-<domain>-* = generated
  "domain": "II",
  "domain_name": "Clinical Evaluation & Diagnosis",
  "type": "multiple_choice_single",
  "stem": "…question text…",
  "options": ["…", "…"],
  "correct_answer": ["…"],        // always an array (multi-select can have >1)
  "explanation": "…why…",
  "answer_confidence": "high",    // "medium" = defensible but some ambiguity
  "source": "extracted_from_screenshot", // or "generated"
  "source_file": "2026-07-05_11-07-00.png" // null for generated
}
```

## Caveats

- Correct answers for extracted questions are **derived**, not taken from an official key
  (the screenshots almost never showed the answer). Review the 18 `answer_confidence: "medium"`
  items before using them for scoring — several had option lists cut off at the screenshot fold.
- Stems and options are preserved **verbatim** from the images, including a few original typos
  (e.g. "effected", "does EIA stands for").
