/**
 * One-time backfill: assign a topicId to every flashcard that does not have
 * one. Uses the OpenAI helper from the api-server (best-effort heuristic so
 * focused review surfaces existing seeded/imported cards).
 *
 * Run with: pnpm --filter @workspace/scripts exec tsx ./src/backfillFlashcardTopics.ts
 */
import { db, flashcards, topics, domains } from "@workspace/db";
import { eq, isNull } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const FAST_MODEL = "gpt-5-mini";
const BATCH = 25;

async function classify(
  cards: { id: number; front: string; back: string }[],
  catalog: string,
): Promise<Map<number, number | null>> {
  const prompt = `You are tagging Athletic Training flashcards to a single best-fit topic from the TOPICS list. Return ONLY JSON of the form {"assignments":[{"id":<card id>,"topicId":<topic id or null>}]}. Use null only if nothing reasonably fits.

TOPICS:
${catalog}

CARDS:
${cards.map((c) => `id=${c.id}\nFront: ${c.front}\nBack: ${c.back}`).join("\n---\n")}`;

  const completion = await openai.chat.completions.create({
    model: FAST_MODEL,
    messages: [
      { role: "system", content: "You classify study flashcards. Respond with valid JSON only." },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  const raw = completion.choices[0]?.message?.content ?? "{}";
  const parsed = JSON.parse(raw) as { assignments?: { id: number; topicId: number | null }[] };
  const out = new Map<number, number | null>();
  for (const a of parsed.assignments ?? []) {
    if (Number.isInteger(a.id)) out.set(Number(a.id), a.topicId == null ? null : Number(a.topicId));
  }
  return out;
}

async function main() {
  const topicRows = await db
    .select({ id: topics.id, name: topics.name, domain: domains.name })
    .from(topics)
    .leftJoin(domains, eq(topics.domainId, domains.id))
    .orderBy(topics.id);
  const validIds = new Set(topicRows.map((t) => t.id));
  const catalog = topicRows
    .map((t) => `- id=${t.id} | ${t.domain ? `[${t.domain}] ` : ""}${t.name}`)
    .join("\n");

  const pending = await db
    .select({ id: flashcards.id, front: flashcards.front, back: flashcards.back })
    .from(flashcards)
    .where(isNull(flashcards.topicId));

  console.log(`Backfilling ${pending.length} flashcards across ${topicRows.length} topics…`);

  let updated = 0;
  let skipped = 0;
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    let assignments: Map<number, number | null>;
    try {
      assignments = await classify(batch, catalog);
    } catch (err) {
      console.error(`Batch ${i / BATCH + 1} failed:`, err);
      continue;
    }
    for (const card of batch) {
      const tid = assignments.get(card.id);
      if (tid != null && validIds.has(tid)) {
        await db.update(flashcards).set({ topicId: tid }).where(eq(flashcards.id, card.id));
        updated += 1;
      } else {
        skipped += 1;
      }
    }
    console.log(`  batch ${i / BATCH + 1}: +${updated} tagged, ${skipped} skipped so far`);
  }

  console.log(`Done. Updated ${updated}, skipped ${skipped}.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});
