/**
 * Per-IP daily rate limiter for the public chat endpoint.
 *
 * Donors (identified via a signed cookie minted after a Stripe donation)
 * bypass this limit entirely — checked by the caller before invoking us.
 *
 * Uses Upstash Redis via @upstash/ratelimit. Free tier covers ~10k req/day,
 * which comfortably covers a small-traffic content site.
 */
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const FREE_DAILY_LIMIT = Number(process.env.CHAT_FREE_DAILY_LIMIT ?? 5);

let limiter: Ratelimit | null = null;

function getLimiter(): Ratelimit | null {
  if (limiter) return limiter;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.fixedWindow(FREE_DAILY_LIMIT, "1 d"),
    analytics: true,
    prefix: "ratelimit:chat",
  });
  return limiter;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  limit: number;
  reset: number; // unix ms
  reason?: string;
};

export async function checkChatRateLimit(ip: string): Promise<RateLimitResult> {
  const l = getLimiter();
  if (!l) {
    // Misconfigured environment — fail closed to avoid runaway cost.
    return {
      allowed: false,
      remaining: 0,
      limit: FREE_DAILY_LIMIT,
      reset: Date.now() + 86_400_000,
      reason: "rate-limit-misconfigured",
    };
  }
  const r = await l.limit(ip);
  return {
    allowed: r.success,
    remaining: r.remaining,
    limit: r.limit,
    reset: r.reset,
  };
}

export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}
