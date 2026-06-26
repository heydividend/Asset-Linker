---
name: BOC domain weights = official blueprint
description: The five domain weights must equal the official BOC Practice Analysis 8th Edition percentages, and what consumes them.
---

The `domains.weight` values are the BOC exam blueprint and must match the
official **Practice Analysis 8th Edition** percentages exactly:

- D1 Risk Reduction, Wellness & Health Literacy — 0.20
- D2 Assessment, Evaluation & Diagnosis — 0.256
- D3 Critical Incident Management — 0.208
- D4 Therapeutic Intervention — 0.256
- D5 Healthcare Administration & Professional Responsibility — 0.08

**Why:** These weights are the single source of truth that makes practice mirror
the real exam. They drive (a) mock-exam question distribution, (b) the
study-schedule focus-day allocation, and (c) the blueprint-weighted dashboard
readiness score. Earlier the values were rough approximations (~21/22/16/24/17)
which over-weighted the lightest domain (Health Admin) and under-weighted the
two heaviest.

**How to apply:** If weights ever change, update BOTH `seed.ts` AND run a live
`UPDATE domains SET weight=...` (seed only runs on a fresh DB). Also keep the
seeded "Five BOC Domains" notebook text in sync, and remember the schedule
allocates focus days *proportionally* to weight via a D'Hondt highest-averages
sequence (not an even rotation), so weight changes shift study-day counts.
