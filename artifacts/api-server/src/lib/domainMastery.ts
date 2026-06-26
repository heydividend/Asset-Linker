import { db, topicMastery, topics } from "@workspace/db";

/**
 * Current per-domain mastery as a fraction in [0, 1], aggregated from topic
 * mastery (sum of correct / sum of attempts across the domain's topics). A
 * domain with no recorded attempts maps to 0 (untouched/weak). This mirrors the
 * dashboard's domain-mastery computation so the schedule's weakness-first day
 * allocation stays consistent with the readiness the user sees.
 */
export async function getDomainMasteryMap(): Promise<Map<number, number>> {
  const mastery = await db.select().from(topicMastery);
  const tRows = await db.select().from(topics);

  const domainIdByTopic = new Map<number, number>(
    tRows.map((t) => [t.id, t.domainId]),
  );
  const correctByDomain = new Map<number, number>();
  const attemptsByDomain = new Map<number, number>();
  for (const m of mastery) {
    const domainId = domainIdByTopic.get(m.topicId);
    if (domainId == null) continue;
    correctByDomain.set(domainId, (correctByDomain.get(domainId) ?? 0) + m.correct);
    attemptsByDomain.set(domainId, (attemptsByDomain.get(domainId) ?? 0) + m.attempts);
  }

  const out = new Map<number, number>();
  for (const [domainId, attempts] of attemptsByDomain) {
    out.set(domainId, attempts > 0 ? (correctByDomain.get(domainId) ?? 0) / attempts : 0);
  }
  return out;
}
