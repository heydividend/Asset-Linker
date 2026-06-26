---
name: PA8 blueprint grounding
description: How official PA8 (BOC Practice Analysis 8th Ed) metadata is wired into the BOC Study Notebook without DB changes.
---

# PA8 grounding design

All official PA8 reference data (domain summaries, per-task knowledge/skill
statements, importance/frequency ratings, domain exam weights) lives in TypeScript,
NOT the database — there is deliberately ZERO schema migration for it.

- Source TS: `artifacts/api-server/src/lib/pa8Reference.ts` (generated from PDFs:
  `PA8_DOMAIN_SUMMARIES`, `PA8_REFERENCE`) and `pa8Blueprint.ts`
  (`PA8_TASK_RATINGS`, `PA8_DOMAIN_WEIGHTS`, `pa8BlueprintText()`).
- It is merged into the existing `/api/blueprint` response at request time
  (route enriches domains with `summary` and tasks with `importance`/`frequency`).
  The OpenAPI schema carries these as nullable fields.

**Why:** the blueprint domains/tasks are static reference content; persisting them
would add migration + seeding overhead for data that never changes per-user.

**How to apply:** to change PA8 reference content, edit the TS files and restart the
api-server. Do NOT add tables/columns for it. Importance scale is 1-4, Frequency 1-5
(UI normalizes /4 and /5; priority scoring normalizes domain weight by the heaviest
domain, 0.256).

**esbuild caveat:** api-server is an esbuild bundle (`build.mjs`, dev = build-then-start,
no watch). The reference must be embedded as a generated TS string and imported — do
NOT read it from a PDF/file at runtime, and always restart the api-server workflow
after editing these files (HMR does not apply to the backend bundle).
