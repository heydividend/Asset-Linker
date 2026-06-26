---
name: PA8 blueprint grounding
description: Decision — official PA8 reference content is TS-only and merged into the blueprint API, never persisted.
---

# PA8 reference content is TS-only, not a DB entity

Official BOC Practice Analysis 8th Edition reference content (domain summaries,
per-task knowledge/skill statements, importance/frequency ratings, domain exam
weights) is stored in TypeScript and merged into the existing `/api/blueprint`
response at request time. There is deliberately ZERO schema migration for it.

**Why:** this is static reference content that never changes per-user; persisting it
would add migration + seeding overhead with no benefit, and it can evolve by editing
TS + restarting.

**How to apply:**
- To change reference content, edit the generating TS and restart the api-server.
  Do NOT add tables/columns for blueprint reference data.
- api-server is an esbuild bundle (build-then-start, no watch), so the reference must
  be embedded as a generated TS string and imported — never read a PDF/file at
  runtime — and the workflow must be restarted after edits (no backend HMR).
- Rating scales: Importance 1-4, Frequency 1-5. Normalize Importance/4, Frequency/5,
  and normalize domain exam weight by the heaviest domain (0.256) when scoring.
