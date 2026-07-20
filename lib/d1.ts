/**
 * D1 client accessor for Next.js on Cloudflare Pages.
 *
 * Cloudflare bindings (D1, KV, R2, env vars marked SECRET) live on the request
 * context, not process.env. `@cloudflare/next-on-pages` exposes them via
 * getRequestContext().env at request time.
 *
 * Usage in route handlers:
 *   import { getDB } from '@/lib/d1'
 *   const db = getDB()
 *   const posts = await db.prepare('SELECT ...').all()
 */
import { getRequestContext } from "@cloudflare/next-on-pages";

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  DEEPSEEK_API_KEY?: string;
  SUNNAH_API_KEY?: string;
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  DONOR_COOKIE_SECRET?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  NEXT_PUBLIC_SITE_URL?: string;
}

export function getEnv(): Env {
  return getRequestContext().env as unknown as Env;
}

export function getDB(): D1Database {
  return getEnv().DB;
}
