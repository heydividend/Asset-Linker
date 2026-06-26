---
name: Readiness score must reflect knowledge, not activity
description: Why the dashboard readiness score deliberately excludes study-activity volume and is blueprint-weighted.
---

The dashboard `/dashboard/summary` readiness score must reflect demonstrated
knowledge only: blueprint-weighted domain mastery (unattempted domains count as
0) blended with the latest mock-exam score (40/60). It must NOT be padded by
study-activity volume (guides/podcasts/games).

**Why:** The student failed the real BOC (370 vs 500 pass) partly because the
old readiness score added an "activity bonus" (up to +10 for busywork) and used
a flat overall correct/attempted ratio that let one heavily-drilled domain mask
four weak ones — producing false confidence. An honest gauge that can't read
"ready" without real mastery + mock evidence is the whole point.

**How to apply:** Keep `readinessBonus` in the response as `0` for API
compatibility, but never feed activity counts into the score. Weight mastery by
domain blueprint weight so coverage across all five domains is required.
