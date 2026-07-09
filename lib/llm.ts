/**
 * Provider-agnostic LLM wrapper.
 *
 * Set LLM_PROVIDER=deepseek to route both the daily generator and the chatbot
 * through DeepSeek instead of Anthropic. Everything else stays identical.
 *
 * DeepSeek is OpenAI-API-compatible; we point the OpenAI SDK at their base URL.
 *
 * Env vars:
 *   LLM_PROVIDER          "anthropic" (default) | "deepseek"
 *   ANTHROPIC_API_KEY     — required when provider is anthropic
 *   CLAUDE_MODEL          — default "claude-opus-4-7"
 *   DEEPSEEK_API_KEY      — required when provider is deepseek
 *   DEEPSEEK_MODEL        — default "deepseek-chat"
 *                            (use "deepseek-reasoner" for R1)
 */
import Anthropic from "@anthropic-ai/sdk";
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

const PROVIDER = (process.env.LLM_PROVIDER?.trim() || "anthropic").toLowerCase();
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";

let cachedAnthropic: Anthropic | null = null;
let cachedDeepSeek: OpenAI | null = null;

function getAnthropicClient(): Anthropic {
  if (cachedAnthropic) return cachedAnthropic;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set (LLM_PROVIDER=anthropic)");
  cachedAnthropic = new Anthropic({ apiKey: key });
  return cachedAnthropic;
}

function getDeepSeekClient(): OpenAI {
  if (cachedDeepSeek) return cachedDeepSeek;
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set (LLM_PROVIDER=deepseek)");
  cachedDeepSeek = new OpenAI({ apiKey: key, baseURL: DEEPSEEK_BASE_URL });
  return cachedDeepSeek;
}

/** Default model for the active provider, respecting env overrides. */
export function defaultModel(): string {
  if (PROVIDER === "deepseek") {
    return process.env.DEEPSEEK_MODEL?.trim() || "deepseek-chat";
  }
  return process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-7";
}

/** Provider label for logging / UI. */
export function llmProvider(): "anthropic" | "deepseek" {
  return PROVIDER === "deepseek" ? "deepseek" : "anthropic";
}

/**
 * Non-streaming completion. Returns the assistant's full text.
 * Used by the daily content generator.
 */
export async function generateContent(opts: ChatOptions): Promise<string> {
  const model = opts.model || defaultModel();
  const maxTokens = opts.maxTokens ?? 4096;

  if (PROVIDER === "deepseek") {
    const client = getDeepSeekClient();
    const resp = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: opts.system },
        ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    });
    return (resp.choices[0]?.message?.content ?? "").trim();
  }

  const client = getAnthropicClient();
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: opts.messages,
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/**
 * Streaming completion. Yields text chunks as the model produces them.
 * Used by the /api/chat streaming route.
 */
export async function* streamContent(opts: ChatOptions): AsyncGenerator<string, void, unknown> {
  const model = opts.model || defaultModel();
  const maxTokens = opts.maxTokens ?? 1024;

  if (PROVIDER === "deepseek") {
    const client = getDeepSeekClient();
    const stream = await client.chat.completions.create({
      model,
      max_tokens: maxTokens,
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
    return;
  }

  const client = getAnthropicClient();
  const stream = await client.messages.stream({
    model,
    max_tokens: maxTokens,
    system: opts.system,
    messages: opts.messages,
  });
  for await (const ev of stream) {
    if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
      yield ev.delta.text;
    }
  }
}
