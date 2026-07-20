/**
 * Per-IP daily rate limiter for /api/chat.
 * Uses Upstash Redis via HTTP (edge-compatible — no persistent connections).
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { getEnv } from "./d1";

const FREE_DAILY_LIMIT = 5;

export type RateLimitResult = { allowed: boolean; remaining: number; limit: number; reset: number; reason?: string };

let cachedLimiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (cachedLimiter) return cachedLimiter;
  const env = getEnv();
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  cachedLimiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(FREE_DAILY_LIMIT, "1 d"),
    analytics: true,
    prefix: "ratelimit:chat",
  });
  return cachedLimiter;
}

export async function checkChatRateLimit(ip: string): Promise<RateLimitResult> {
  const l = getLimiter();
  if (!l) return { allowed: false, remaining: 0, limit: FREE_DAILY_LIMIT, reset: Date.now() + 86400_000, reason: "rate-limit-misconfigured" };
  const r = await l.limit(ip);
  return { allowed: r.success, remaining: r.remaining, limit: r.limit, reset: r.reset };
}

export function getClientIp(req: Request): string {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf;
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}
