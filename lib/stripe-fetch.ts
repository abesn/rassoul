/**
 * Edge-compatible Stripe API calls via raw fetch.
 * Replaces the Node-only 'stripe' SDK.
 *
 * Only implements the endpoints rassoul.org uses:
 *   - Checkout Sessions: create + retrieve
 *   - Webhook signature verification (uses Web Crypto subtle)
 */
import { getEnv } from "./d1";

const STRIPE_API = "https://api.stripe.com/v1";

function key(): string {
  const k = getEnv().STRIPE_SECRET_KEY;
  if (!k) throw new Error("STRIPE_SECRET_KEY not set");
  return k;
}

function formEncode(obj: Record<string, unknown>, prefix = ""): string[] {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === null || v === undefined) continue;
    if (typeof v === "object" && !Array.isArray(v)) {
      out.push(...formEncode(v as Record<string, unknown>, key));
    } else if (Array.isArray(v)) {
      v.forEach((el, i) => {
        if (typeof el === "object") out.push(...formEncode(el as Record<string, unknown>, `${key}[${i}]`));
        else out.push(`${encodeURIComponent(`${key}[${i}]`)}=${encodeURIComponent(String(el))}`);
      });
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
    }
  }
  return out;
}

export async function createCheckoutSession(params: {
  mode: "payment";
  amountCents: number;
  successUrl: string;
  cancelUrl: string;
  productName: string;
  productDescription: string;
}): Promise<{ id: string; url: string }> {
  const body = formEncode({
    mode: params.mode,
    payment_method_types: ["card"],
    submit_type: "donate",
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: params.amountCents,
          product_data: { name: params.productName, description: params.productDescription },
        },
      },
    ],
  }).join("&");
  const res = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`Stripe error ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { id: string; url: string };
  return { id: data.id, url: data.url };
}

/** Verify a Stripe webhook signature using Web Crypto (subtle) — edge-compatible. */
export async function verifyWebhookSignature(payload: string, sigHeader: string, secret: string, tolerance = 300): Promise<{ ok: boolean; error?: string }> {
  // sigHeader format: "t=timestamp,v1=hex,v0=hex,..."
  const parts = sigHeader.split(",").map((p) => p.trim().split("="));
  const t = parts.find((p) => p[0] === "t")?.[1];
  const sigs = parts.filter((p) => p[0] === "v1").map((p) => p[1]);
  if (!t || sigs.length === 0) return { ok: false, error: "Malformed Stripe-Signature header" };

  const signedPayload = `${t}.${payload}`;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const expectedBytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(signedPayload)));
  const expectedHex = Array.from(expectedBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

  const matches = sigs.some((sig) => timingSafeEqual(sig, expectedHex));
  if (!matches) return { ok: false, error: "Signature mismatch" };

  const timestamp = Number(t);
  if (!Number.isFinite(timestamp)) return { ok: false, error: "Invalid timestamp" };
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > tolerance) return { ok: false, error: "Timestamp outside tolerance" };
  return { ok: true };
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
