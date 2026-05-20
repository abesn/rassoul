/**
 * Donor identification.
 *
 * Flow:
 *  1. User completes Stripe Checkout (one-time donation, any amount >= $1).
 *  2. Stripe webhook records the session_id in Upstash with TTL = 90 days.
 *  3. The success page calls /api/donate/verify which:
 *      - confirms the session_id is recorded as paid
 *      - mints a signed JWT cookie (rassoul_donor) valid for 90 days
 *  4. Chat API checks for the cookie and bypasses the rate limit if valid.
 *
 * If DONOR_COOKIE_SECRET is unset we fail closed (no donor bypass), so a
 * misconfigured environment doesn't accidentally let everyone in.
 */
import { SignJWT, jwtVerify } from "jose";
import { Redis } from "@upstash/redis";

const DONOR_COOKIE = "rassoul_donor";
const DONOR_TTL_DAYS = 90;

function getSecret(): Uint8Array | null {
  const s = process.env.DONOR_COOKIE_SECRET;
  if (!s || s.length < 32) return null;
  return new TextEncoder().encode(s);
}

function getRedis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  return new Redis({ url, token });
}

export async function recordDonation(sessionId: string, amountCents: number): Promise<void> {
  const redis = getRedis();
  if (!redis) throw new Error("Upstash not configured");
  const key = `donor:session:${sessionId}`;
  await redis.set(key, JSON.stringify({ amountCents, at: Date.now() }), {
    ex: DONOR_TTL_DAYS * 86_400,
  });
}

export async function isPaidSession(sessionId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  const v = await redis.get(`donor:session:${sessionId}`);
  return v !== null;
}

export async function mintDonorCookie(sessionId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error("DONOR_COOKIE_SECRET not set or too short");
  return await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DONOR_TTL_DAYS}d`)
    .sign(secret);
}

export async function verifyDonorCookie(cookieValue: string | undefined): Promise<boolean> {
  if (!cookieValue) return false;
  const secret = getSecret();
  if (!secret) return false;
  try {
    await jwtVerify(cookieValue, secret);
    return true;
  } catch {
    return false;
  }
}

export const DONOR_COOKIE_NAME = DONOR_COOKIE;
export const DONOR_COOKIE_TTL_SECONDS = DONOR_TTL_DAYS * 86_400;
