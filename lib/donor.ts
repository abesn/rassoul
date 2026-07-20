/**
 * Donor cookie: signed JWT minted after a Stripe donation.
 * Chat route checks for this cookie to bypass the free-tier rate limit.
 */
import { SignJWT, jwtVerify } from "jose";
import { Redis } from "@upstash/redis";
import { getEnv } from "./d1";

const DONOR_COOKIE = "rassoul_donor";
const DONOR_TTL_DAYS = 90;

function secret(): Uint8Array | null {
  const s = getEnv().DONOR_COOKIE_SECRET;
  if (!s || s.length < 32) return null;
  return new TextEncoder().encode(s);
}

function redis(): Redis | null {
  const env = getEnv();
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) return null;
  return new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
}

export async function recordDonation(sessionId: string, amountCents: number): Promise<void> {
  const r = redis();
  if (!r) throw new Error("Upstash not configured");
  await r.set(`donor:session:${sessionId}`, JSON.stringify({ amountCents, at: Date.now() }), { ex: DONOR_TTL_DAYS * 86400 });
}

export async function isPaidSession(sessionId: string): Promise<boolean> {
  const r = redis();
  if (!r) return false;
  return (await r.get(`donor:session:${sessionId}`)) !== null;
}

export async function mintDonorCookie(sessionId: string): Promise<string> {
  const s = secret();
  if (!s) throw new Error("DONOR_COOKIE_SECRET not set or too short");
  return await new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime(`${DONOR_TTL_DAYS}d`).sign(s);
}

export async function verifyDonorCookie(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const s = secret();
  if (!s) return false;
  try {
    await jwtVerify(cookieValue, s);
    return true;
  } catch {
    return false;
  }
}

export const DONOR_COOKIE_NAME = DONOR_COOKIE;
export const DONOR_COOKIE_TTL_SECONDS = DONOR_TTL_DAYS * 86400;
