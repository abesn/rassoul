import { createCheckoutSession } from "@/lib/stripe-fetch";
import { getEnv } from "@/lib/d1";

export const runtime = "edge";

export async function POST(req: Request) {
  let body: { amountCents?: number } = {};
  try {
    body = await req.json();
  } catch {}
  const amount = Math.max(Math.floor(body.amountCents ?? 500), 100);
  const site = getEnv().NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";
  try {
    const session = await createCheckoutSession({
      mode: "payment",
      amountCents: amount,
      successUrl: `${site}/donate/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${site}/donate?canceled=1`,
      productName: "Support rassoul.org",
      productDescription: "One-time donation. Unlocks unlimited chatbot questions for 90 days. May Allah reward you.",
    });
    return new Response(JSON.stringify({ url: session.url }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
