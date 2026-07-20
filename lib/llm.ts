/**
 * DeepSeek LLM wrapper — pure fetch, edge-runtime compatible.
 * Avoids the OpenAI Node SDK (has Node deps that don't work on Cloudflare Workers).
 */
import { getEnv } from "./d1";

export type LlmMessage = { role: "user" | "assistant" | "system"; content: string };

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

export function defaultModel(): string {
  return "deepseek-chat";
}

export interface ChatOptions {
  system: string;
  messages: LlmMessage[];
  maxTokens?: number;
  model?: string;
}

export async function generateContent(opts: ChatOptions): Promise<string> {
  const key = getEnv().DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? defaultModel(),
      max_tokens: opts.maxTokens ?? 4096,
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
    }),
  });
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return (data.choices?.[0]?.message?.content ?? "").trim();
}

export async function* streamContent(opts: ChatOptions): AsyncGenerator<string, void, unknown> {
  const key = getEnv().DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY not set");
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? defaultModel(),
      max_tokens: opts.maxTokens ?? 1024,
      stream: true,
      messages: [{ role: "system", content: opts.system }, ...opts.messages],
    }),
  });
  if (!res.ok || !res.body) throw new Error(`DeepSeek stream failed ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      try {
        const chunk = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
        const text = chunk.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch {
        /* ignore malformed line */
      }
    }
  }
}
