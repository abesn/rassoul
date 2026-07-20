import { getAllPosts } from "@/lib/posts";
import { getEnv } from "@/lib/d1";

export const runtime = "edge";

function escape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string));
}

export async function GET() {
  const site = getEnv().NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";
  const posts = await getAllPosts(50);
  const items = posts
    .map((p) => {
      const link = `${site}${p.url}`;
      const pub = p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString();
      return `<item><title>${escape(p.title)}</title><link>${link}</link><guid>${link}</guid><pubDate>${pub}</pubDate>${p.description ? `<description>${escape(p.description)}</description>` : ""}</item>`;
    })
    .join("\n");
  const xml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Rassoul</title><link>${site}</link><description>Source-grounded da'wah content.</description><language>en</language>${items}</channel></rss>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
