import { isPaidSession, mintDonorCookie, DONOR_COOKIE_NAME, DONOR_COOKIE_TTL_SECONDS } from "@/lib/donor";

export const runtime = "edge";

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...extraHeaders } });
}

export async function POST(req: Request) {
  let body: { sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid json" }, 400);
  }
  if (!body.sessionId) return json({ error: "sessionId required" }, 400);

  const paid = await isPaidSession(body.sessionId);
  if (!paid) return json({ error: "session not found or not paid yet" }, 404);

  const token = await mintDonorCookie(body.sessionId);
  const secure = "; Secure";
  const cookie = `${DONOR_COOKIE_NAME}=${token}; Path=/; Max-Age=${DONOR_COOKIE_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
  return json({ ok: true }, 200, { "Set-Cookie": cookie });
}
