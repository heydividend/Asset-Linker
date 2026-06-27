import { eq } from "drizzle-orm";
import { db, tasks } from "@workspace/db";
import { anthropic } from "@workspace/integrations-anthropic-ai";

export interface ClassifiableQuestion {
  stem: string;
  choices?: string[] | null;
  rationale?: string | null;
}

// Classify a question to the single best-fitting PA8 task within its domain.
// The model only ever chooses among the tasks that belong to `domainId`, so a
// D3 question can never be mislabeled with a D5 task. Returns the matching
// task id, or null if the domain is unknown or the model can't decide.
export async function classifyTaskId(
  q: ClassifiableQuestion,
  domainId: number | null | undefined,
): Promise<number | null> {
  if (!domainId) return null;
  const candidates = await db
    .select({ id: tasks.id, code: tasks.code, statement: tasks.statement })
    .from(tasks)
    .where(eq(tasks.domainId, domainId))
    .orderBy(tasks.sortOrder);
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].id;

  const codeToId = new Map(candidates.map((c) => [c.code, c.id]));
  const taskList = candidates.map((c) => `${c.code}: ${c.statement}`).join("\n");
  const choicesText = (q.choices ?? []).map((c, i) => `${i + 1}. ${c}`).join("\n");

  try {
    const message = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      temperature: 0,
      system:
        "You classify Athletic Training BOC exam questions to the single best-fitting task statement from the official BOC Practice Analysis 8th Edition. You are given the candidate tasks for the question's domain. Choose the ONE task code that best matches what the question is testing. Respond with ONLY the 4-digit task code (e.g. 0303). No prose.",
      messages: [
        {
          role: "user",
          content: `CANDIDATE TASKS:\n${taskList}\n\nQUESTION:\n${q.stem}\n${choicesText ? `\nChoices:\n${choicesText}` : ""}${q.rationale ? `\n\nRationale: ${q.rationale}` : ""}\n\nReturn the single best task code.`,
        },
      ],
    });
    const raw = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");
    const match = raw.match(/\d{4}/);
    const code = match ? match[0] : null;
    if (code && codeToId.has(code)) return codeToId.get(code)!;
  } catch {
    // Classification is best-effort; leave untagged on failure.
  }
  return null;
}
