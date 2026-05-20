import Stripe from "stripe";

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  // Omit apiVersion → SDK uses the version pinned in your Stripe account
  // settings. Avoids type-union drift across @stripe/stripe-node releases.
  cached = new Stripe(key);
  return cached;
}
