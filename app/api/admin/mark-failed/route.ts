/**
 * POST /api/admin/mark-failed
 *
 * Called by n8n for topics where DeepSeek returned NO_SOURCES or an error.
 * Marks the topic as 'failed' so it isn't re-picked tomorrow.
 *
 * Body: { slug: string, cluster: string, reason?: string }
 */
import { getDB } from "@/lib/d1";
import { verifyAdminRequest } from "@/lib/auth";

export const runtime = "edge";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: Request) {
  const auth = verifyAdminRequest(req);
  if (!auth.ok) return json({ error: auth.error }, 401);

  const body = (await req.json().catch(() => ({}))) as { slug?: string; cluster?: string };
  if (!body.slug || !body.cluster) return json({ error: "Missing slug or cluster" }, 400);

  const db = getDB();
  await db
    .prepare("UPDATE topics SET status = 'failed', last_attempt_at = ? WHERE cluster = ? AND slug = ?")
    .bind(new Date().toISOString(), body.cluster, body.slug)
    .run();

  return json({ ok: true });
}
