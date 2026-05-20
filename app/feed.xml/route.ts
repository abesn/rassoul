import { getAllPosts } from "@/lib/posts";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";

function escape(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[c] as string)
  );
}

export async function GET() {
  const posts = getAllPosts();
  const items = posts
    .slice(0, 50)
    .map((p) => {
      const link = `${SITE_URL}${p.url}`;
      const pub = p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString();
      return `<item>
  <title>${escape(p.title)}</title>
  <link>${link}</link>
  <guid>${link}</guid>
  <pubDate>${pub}</pubDate>
  ${p.description ? `<description>${escape(p.description)}</description>` : ""}
</item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8" ?>
<rss version="2.0">
  <channel>
    <title>Rassoul</title>
    <link>${SITE_URL}</link>
    <description>Source-grounded da'wah content.</description>
    <language>en</language>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8" } });
}
