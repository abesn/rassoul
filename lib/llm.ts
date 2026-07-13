/**
 * LLM wrapper — DeepSeek-only.
 *
 * DeepSeek's API is OpenAI-compatible; we point the OpenAI SDK at their base URL.
 *
 * Env vars:
 *   DEEPSEEK_API_KEY   — required
 *   DEEPSEEK_MODEL     — default "deepseek-chat" (use "deepseek-reasoner" for R1)
 */
import OpenAI from "openai";

export type LlmMessage = { role: "user" | "assistant"; content: string };

export interface ChatOptions {
  system: string;
  messages: LlmMessage[];
  /** Max tokens in the response. Defaults to 4096 for generate, 1024 for stream. */
  maxTokens?: number;
  /** Override the default model. */
  model?: string;
}

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

let cached: OpenAI | null = null;

function getClient(): OpenAI {
  if (cached) return cached;
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set");
  cached = new OpenAI({ apiKey: key, baseURL: DEEPSEEK_BASE_URL });
  return cached;
}

/** Default model, respecting env override. */
export function defaultModel(): string {
  return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
}

/**
 * Non-streaming completion. Returns the assistant's full text.
 */
export async function generateContent(opts: ChatOptions): Promise<string> {
  const client = getClient();
  const resp = await client.chat.completions.create({
    model: opts.model || defaultModel(),
    max_tokens: opts.maxTokens ?? 4096,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  return (resp.choices[0]?.message?.content ?? "").trim();
}

/**
 * Streaming completion. Yields text chunks as the model produces them.
 * Used by the /api/chat streaming route.
 */
export async function* streamContent(opts: ChatOptions): AsyncGenerator<string, void, unknown> {
  const client = getClient();
  const stream = await client.chat.completions.create({
    model: opts.model || defaultModel(),
    max_tokens: opts.maxTokens ?? 1024,
    stream: true,
    messages: [
      { role: "system", content: opts.system },
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ],
  });
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content;
    if (text) yield text;
  }
}
