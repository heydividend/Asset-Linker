import { openai } from "@workspace/integrations-openai-ai-server";

export const DEFAULT_MODEL = "gpt-5.4";
export const FAST_MODEL = "gpt-5-mini";

export async function chatJson<T>(
  prompt: string,
  systemHint = "You are an expert Athletic Training tutor preparing a student for the BOC exam. Respond ONLY with valid JSON.",
  model = FAST_MODEL,
): Promise<T> {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemHint },
      { role: "user", content: prompt },
    ],
    response_format: { type: "json_object" },
  });
  const content = completion.choices[0]?.message?.content ?? "{}";
  return JSON.parse(content) as T;
}

export async function chatText(
  prompt: string,
  systemHint = "You are an expert Athletic Training tutor.",
  model = FAST_MODEL,
): Promise<string> {
  const completion = await openai.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemHint },
      { role: "user", content: prompt },
    ],
  });
  return completion.choices[0]?.message?.content ?? "";
}

export function truncate(text: string, max = 6000): string {
  return text.length > max ? text.slice(0, max) + "\n…[truncated]" : text;
}
