import { anthropic } from "@workspace/integrations-anthropic-ai";

// Claude models via the Replit AI Integrations proxy. FAST is used for the bulk
// of generation/grading work; DEFAULT is reserved for heavier prompts.
export const DEFAULT_MODEL = "claude-sonnet-4-6";
export const FAST_MODEL = "claude-haiku-4-5";

type TextBlock = { type: "text"; text: string };

function blocksToText(content: Array<{ type: string }>): string {
  return content
    .map((b) => (b.type === "text" ? (b as TextBlock).text : ""))
    .join("");
}

// Claude returns prose, not a guaranteed JSON envelope, so strip any markdown
// code fences and isolate the first JSON value before parsing.
function extractJson(raw: string): string {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
  return s.trim();
}

export async function chatJson<T>(
  prompt: string,
  systemHint = "You are an expert Athletic Training tutor preparing a student for the BOC exam. Respond ONLY with valid JSON. Do not wrap the JSON in markdown code fences.",
  model = FAST_MODEL,
): Promise<T> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemHint,
    messages: [{ role: "user", content: prompt }],
  });
  const content = blocksToText(message.content) || "{}";
  return JSON.parse(extractJson(content)) as T;
}

export async function chatText(
  prompt: string,
  systemHint = "You are an expert Athletic Training tutor.",
  model = FAST_MODEL,
): Promise<string> {
  const message = await anthropic.messages.create({
    model,
    max_tokens: 8192,
    system: systemHint,
    messages: [{ role: "user", content: prompt }],
  });
  return blocksToText(message.content);
}

export function truncate(text: string, max = 6000): string {
  return text.length > max ? text.slice(0, max) + "\n…[truncated]" : text;
}
