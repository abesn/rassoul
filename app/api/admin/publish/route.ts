/**
 * POST /api/admin/publish
 *
 * Called by n8n after generating one post. Writes to D1: inserts (or replaces)
 * the post row, updates the corresponding topic row's status + published_at.
 *
 * Body:
 *   {
 *     slug: string,
 *     cluster: string,
 *     title: string,
 *     description?: string,
 *     keyword?: string,
 *     html: string,           // pre-compiled HTML from n8n
 *     rawMdx?: string,        // optional: original MDX for reference
 *     citations?: string[],   // list of source URLs used
 *     reviewNotes?: string[], // validation notes
 *     status?: 'published' | 'needs_review'  // default 'published'
 *   }
 */
import { getDB } from "@/lib/d1";
import { verifyAdminRequest } from "@/lib/auth";

export const runtime = "edge";

type Body = {
  slug?: string;
  cluster?: string;
  title?: string;
  description?: string;
  keyword?: string;
  html?: string;
  rawMdx?: string;
  citations?: string[];
  reviewNotes?: string[];
  status?: "published" | "needs_review";
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export async function POST(req: Request) {
  const auth = verifyAdminRequest(req);
  if (!auth.ok) return json({ error: auth.error }, 401);

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const required = ["slug", "cluster", "title", "html"] as const;
  for (const k of required) {
    if (!body[k] || typeof body[k] !== "string") return json({ error: `Missing or invalid '${k}'` }, 400);
  }

  const status = body.status === "needs_review" ? "needs_review" : "published";
  const now = new Date().toISOString();
  const citations = body.citations ? JSON.stringify(body.citations) : null;
  const reviewNotes = body.reviewNotes && body.reviewNotes.length ? JSON.stringify(body.reviewNotes) : null;

  const db = getDB();
  // Upsert post
  await db
    .prepare(
      `INSERT INTO posts (slug, cluster, title, description, keyword, html, raw_mdx, citations, review_notes, status, published_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(cluster, slug) DO UPDATE SET
         title = excluded.title,
         description = excluded.description,
         keyword = excluded.keyword,
         html = excluded.html,
         raw_mdx = excluded.raw_mdx,
         citations = excluded.citations,
         review_notes = excluded.review_notes,
         status = excluded.status,
         updated_at = excluded.updated_at`,
    )
    .bind(
      body.slug!,
      body.cluster!,
      body.title!,
      body.description ?? null,
      body.keyword ?? null,
      body.html!,
      body.rawMdx ?? null,
      citations,
      reviewNotes,
      status,
      now,
      now,
    )
    .run();

  // Update topic row (if it exists)
  await db
    .prepare(
      `UPDATE topics
       SET status = ?, published_at = ?, url = ?
       WHERE cluster = ? AND slug = ?`,
    )
    .bind(status, now, `/${body.cluster}/${body.slug}`, body.cluster!, body.slug!)
    .run();

  return json({ ok: true, url: `/${body.cluster}/${body.slug}`, status });
}
