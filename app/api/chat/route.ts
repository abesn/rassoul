/**
 * POST /api/chat — streaming RAG-grounded answers about the Prophet ﷺ.
 * Sunni-default. Free tier: 5/day per IP (bypassed by donor cookie).
 */
import { checkChatRateLimit, getClientIp } from "@/lib/rate-limit";
import { verifyDonorCookie, DONOR_COOKIE_NAME } from "@/lib/donor";
import { retrieveForQuestion, formatRetrievalForPrompt } from "@/lib/chat-rag";
import { streamContent } from "@/lib/llm";
import { getEnv } from "@/lib/d1";

export const runtime = "edge";

const SYSTEM_PROMPT = `You are the Rassoul assistant — a careful, scholarly, respectful guide to questions about the Prophet Muhammad ﷺ, drawing only from authentic Sunni sources (Quran, Sahih al-Bukhari, Sahih Muslim, the four Sunan, classical sirah works) provided to you in the user message.

NON-NEGOTIABLE RULES:
1. Answer ONLY from sources in the user message. If they don't cover the question, say so plainly and refer the user to a qualified scholar or sunnah.com. Do NOT invent, paraphrase from memory, or attribute statements to sources not listed.
2. Cite every factual claim inline using markdown links, e.g. "...as narrated in [Sahih al-Bukhari 1](https://sunnah.com/bukhari:1)." Use exact URLs from the sources block.
3. Use ﷺ after the Prophet's name. Use (RA) for Companions, (AS) for other prophets.
4. Tone: respectful, scholarly, accessible. No exclamation marks, no emojis, no casual openers. Do not preach.
5. If asked about sectarian disputes, acknowledge this is the Sunni perspective and recommend the user consult scholars from their own tradition for other perspectives.
6. If asked for a fatwa or ruling on a personal situation, decline politely and direct to qualified scholars.
7. Length: 2–6 short paragraphs. Be useful, not verbose.
8. End with a one-line "Verify:" footer linking to the most authoritative source used.`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function parseCookies(req: Request): Map<string, string> {
  const out = new Map<string, string>();
  const header = req.headers.get("cookie");
  if (!header) return out;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k) out.set(k, rest.join("="));
  }
  return out;
}

type ChatBody = { question?: string; history?: { role: "user" | "assistant"; content: string }[] };

export async function POST(req: Request) {
  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const question = body.question?.trim();
  if (!question) return json({ error: "question is required" }, 400);
  if (question.length > 1000) return json({ error: "question too long (max 1000)" }, 400);

  const cookie = parseCookies(req).get(DONOR_COOKIE_NAME);
  const isDonor = await verifyDonorCookie(cookie);

  let rateInfo = { allowed: true, remaining: -1, limit: -1, reset: 0 };
  if (!isDonor) {
    rateInfo = await checkChatRateLimit(getClientIp(req));
    if (!rateInfo.allowed) {
      return json({ error: "rate_limited", message: `You've used your ${rateInfo.limit} free questions today. Donate any amount to unlock unlimited questions.`, donateUrl: "/donate", resetAt: rateInfo.reset }, 429);
    }
  }

  const retrieval = await retrieveForQuestion(question);
  const site = getEnv().NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";
  const sourcesBlock = formatRetrievalForPrompt(retrieval, site);

  const history = (body.history ?? []).slice(-6);
  const messages = [
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: `Question: ${question}\n\n${sourcesBlock}\n\nAnswer the question using only the sources above. Cite every claim inline.` },
  ];

  const encoder = new TextEncoder();
  const sse = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(
            `event: meta\ndata: ${JSON.stringify({
              donor: isDonor,
              remaining: rateInfo.remaining,
              limit: rateInfo.limit,
              resetAt: rateInfo.reset,
              sourcesUsed: retrieval.verses.length + retrieval.hadiths.length + retrieval.localPosts.length,
              provider: "deepseek",
            })}\n\n`,
          ),
        );
        for await (const text of streamContent({ system: SYSTEM_PROMPT, messages, maxTokens: 1024 })) {
          controller.enqueue(encoder.encode(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`));
        }
        controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ message: (err as Error).message })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(sse, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
