/**
 * POST /api/donate/webhook
 *
 * Stripe webhook. On `checkout.session.completed` we record the session_id
 * in Upstash so the /api/donate/verify endpoint can later mint a donor cookie.
 *
 * Configure the endpoint in Stripe dashboard:
 *   https://dashboard.stripe.com/webhooks
 *   URL: https://rassoul.org/api/donate/webhook
 *   Events: checkout.session.completed
 */
import { getStripe } from "@/lib/stripe";
import { recordDonation } from "@/lib/donor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) {
    return new Response("missing signature or secret", { status: 400 });
  }

  const stripe = getStripe();
  const rawBody = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err) {
    return new Response(`webhook signature failed: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    if (session.payment_status === "paid" && session.amount_total) {
      await recordDonation(session.id, session.amount_total);
    }
  }

  return new Response("ok", { status: 200 });
}
