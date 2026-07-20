/**
 * GET /api/admin/topics-next-batch
 *
 * Returns one top-priority pending topic per cluster (up to 10 topics).
 * Called by n8n at the start of each daily run.
 */
import { pickDailyBatch } from "@/lib/posts";
import { verifyAdminRequest } from "@/lib/auth";

export const runtime = "edge";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function GET(req: Request) {
  const auth = verifyAdminRequest(req);
  if (!auth.ok) return json({ error: auth.error }, 401);

  const topics = await pickDailyBatch();
  return json({ topics, count: topics.length });
}
