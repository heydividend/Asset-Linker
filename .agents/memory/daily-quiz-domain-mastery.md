---
name: Daily quiz must carry topicId for domain mastery
description: Why generated/seeded questions need a topicId, and where domain mastery is aggregated.
---

Per-domain mastery is aggregated **only** from `topicMastery` (joined topic→domain), not from a question's `domainId`. See `getDomainMasteryMap` in api-server `lib/domainMastery.ts`.

**Rule:** any question that should count toward per-domain mastery must be assigned a `topicId` that belongs to its domain. A question with `domainId` set but `topicId` null contributes nothing to domain mastery (the dashboard/schedule weakness weighting won't see it).

**Why:** the AI generator frequently returns null/invalid topicIds. The daily-quiz generator round-robins unmapped questions across the domain's seeded topics so all 50 roll up into mastery.

**How to apply:** when generating or seeding questions for mastery tracking, fall back to a domain topic when the model omits one; never leave topicId null if the question must score toward a domain.
