/**
 * POST /api/donate/verify
 *
 * Body: { sessionId: string }
 *
 * Looks up the session in Upstash (populated by the webhook). If found,
 * mints a signed donor cookie valid for 90 days and sets it on the response.
 */
import { isPaidSession, mintDonorCookie, DONOR_COOKIE_NAME, DONOR_COOKIE_TTL_SECONDS } from "@/lib/donor";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { sessionId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  const sessionId = body.sessionId;
  if (!sessionId) return json({ error: "sessionId required" }, 400);

  const paid = await isPaidSession(sessionId);
  if (!paid) return json({ error: "session not found or not paid yet" }, 404);

  const token = await mintDonorCookie(sessionId);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const cookie = `${DONOR_COOKIE_NAME}=${token}; Path=/; Max-Age=${DONOR_COOKIE_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json", "Set-Cookie": cookie },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
