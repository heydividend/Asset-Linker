---
name: Readiness trend hover
description: Gotchas for the readiness trend chart's hover/tap details and verifying them.
---

# Readiness trend hover details

The readiness trend line (boc-notebook dashboard, `ReadinessTrend.tsx`) reveals each
day's date + readiness score on hover/tap.

## Verifying it
- The dashboard route **upserts TODAY's `readiness_snapshots` row live** every time the
  dashboard loads, so any value you seed for today gets overwritten by the live score.
  Seed and assert hover values on **historical** days instead, not today.
- Needs ≥2 historical snapshots to draw a line; with fewer it shows the "Trend builds as
  you study" empty state.
