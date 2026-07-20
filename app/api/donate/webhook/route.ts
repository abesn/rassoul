import { verifyWebhookSignature } from "@/lib/stripe-fetch";
import { recordDonation } from "@/lib/donor";
import { getEnv } from "@/lib/d1";

export const runtime = "edge";

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const secret = getEnv().STRIPE_WEBHOOK_SECRET;
  if (!sig || !secret) return new Response("missing signature or secret", { status: 400 });

  const payload = await req.text();
  const check = await verifyWebhookSignature(payload, sig, secret);
  if (!check.ok) return new Response(`webhook signature failed: ${check.error}`, { status: 400 });

  const event = JSON.parse(payload) as {
    type: string;
    data?: { object?: { id?: string; payment_status?: string; amount_total?: number } };
  };
  if (event.type === "checkout.session.completed") {
    const s = event.data?.object;
    if (s?.id && s.payment_status === "paid" && s.amount_total) {
      await recordDonation(s.id, s.amount_total);
    }
  }
  return new Response("ok", { status: 200 });
}
