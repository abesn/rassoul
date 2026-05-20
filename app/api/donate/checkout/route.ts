/**
 * POST /api/donate/checkout
 *
 * Creates a Stripe Checkout session for a one-time donation, custom amount,
 * $1 minimum. Returns the URL to redirect the user to.
 */
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";

export async function POST(req: Request) {
  let body: { amountCents?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — fall back to default */
  }
  const amount = Math.max(Math.floor(body.amountCents ?? 500), 100); // $1 min, $5 default

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amount,
          product_data: {
            name: "Support rassoul.org",
            description:
              "One-time donation. Unlocks unlimited chatbot questions for 90 days. May Allah reward you.",
          },
        },
      },
    ],
    success_url: `${SITE_URL}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${SITE_URL}/donate?canceled=1`,
    submit_type: "donate",
  });

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
