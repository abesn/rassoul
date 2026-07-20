/**
 * GET /api/admin/run-summary?minutes=15
 *
 * Counts posts written in the last N minutes, grouped by status.
 * Called by n8n's Aggregate summary node to get accurate publish counts
 * (n8n's own $('Node').all() doesn't aggregate across loop iterations).
 */
import { getDB } from "@/lib/d1";
import { verifyAdminRequest } from "@/lib/auth";

export const runtime = "edge";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: Request) {
  const auth = verifyAdminRequest(req);
  if (!auth.ok) return json({ error: auth.error }, 401);

  const url = new URL(req.url);
  const minutes = Math.max(1, Math.min(1440, Number(url.searchParams.get("minutes") ?? 15)));
  const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();

  const db = getDB();
  const { results } = await db
    .prepare("SELECT status, COUNT(*) as n FROM posts WHERE updated_at > ? GROUP BY status")
    .bind(cutoff)
    .all<{ status: string; n: number }>();

  const counts: Record<string, number> = { published: 0, needs_review: 0 };
  let total = 0;
  for (const r of results ?? []) {
    counts[r.status] = r.n;
    total += r.n;
  }

  // Failed posts don't hit /publish, so we track them via topics.status = 'failed' set recently.
  const { results: failedRows } = await db
    .prepare("SELECT COUNT(*) as n FROM topics WHERE status = 'failed' AND last_attempt_at > ?")
    .bind(cutoff)
    .all<{ n: number }>();
  const failed = failedRows?.[0]?.n ?? 0;

  return json({
    published: counts.published ?? 0,
    needs_review: counts.needs_review ?? 0,
    failed,
    total: total + failed,
    since: cutoff,
    minutes,
  });
}
