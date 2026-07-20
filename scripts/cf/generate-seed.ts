/**
 * Generate migrations/seed.sql from existing MDX files and topics.csv.
 *
 * Run:
 *   npm run cf:generate-seed
 * Then apply:
 *   npm run cf:seed:local    # writes to local D1
 *   npm run cf:seed:prod     # writes to production D1
 *
 * Compiles each MDX file to HTML using next-mdx-remote/serialize so the resulting
 * seed.sql can be loaded into D1 and served directly (no MDX runtime at edge).
 */
import fs from "node:fs";
import path from "node:path";
import { parse } from "csv-parse/sync";
import matter from "gray-matter";
import { serialize } from "next-mdx-remote/serialize";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";

const ROOT = path.resolve(__dirname, "../..");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const TOPICS_CSV = path.join(ROOT, "content", "topics.csv");
const OUT_SQL = path.join(ROOT, "migrations", "seed.sql");

function esc(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

async function compileMdxToHtml(mdxBody: string): Promise<string> {
  // We can't easily render JSX components (Arabic, Citation) to raw HTML here
  // without a full React renderer. So we do a lightweight text-substitution pass:
  //   - <Arabic>{"..."}</Arabic>   → <div class="arabic-block">...</div>
  //   - <Citation source="..." book="..." number="..." href="..." />
  //                                 → <a href="..." class="citation">source book number</a>
  // Then process the remaining markdown to HTML via serialize's compiledSource.
  //
  // For the migration seed, this is best-effort. New posts from n8n use the same
  // shapes, so the substitutions match.
  let s = mdxBody
    .replace(/<Arabic>\s*\{["']([^"']+)["']\}\s*<\/Arabic>/g, '<div class="arabic-block">$1</div>')
    .replace(/<Arabic>\s*([^<]+?)\s*<\/Arabic>/g, '<div class="arabic-block">$1</div>')
    .replace(
      /<Citation\s+([^/]*?)\/>/g,
      (_, attrs: string) => {
        const source = /source="([^"]+)"/.exec(attrs)?.[1] ?? "";
        const book = /book="([^"]+)"/.exec(attrs)?.[1] ?? "";
        const number = /number="([^"]+)"/.exec(attrs)?.[1] ?? "";
        const href = /href="([^"]+)"/.exec(attrs)?.[1] ?? "#";
        const label = [source, book, number].filter(Boolean).join(" ");
        return `<a href="${href}" class="citation" target="_blank" rel="noreferrer">${label}</a>`;
      },
    );

  const compiled = await serialize(s, { mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug], format: "mdx" } });
  // serialize returns a compiled MDX source, not HTML. For a real HTML output
  // we'd need to render to string. Fallback: return the marked-up text (which
  // is already mostly HTML after our substitutions above, plus markdown).
  // We use a minimal markdown-to-HTML pass here.
  return minimalMarkdownToHtml(s);
}

function minimalMarkdownToHtml(md: string): string {
  // Extremely minimal markdown → HTML. Good enough for the seed.
  // New posts from n8n will use its Code node's full compiler.
  let out = md
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/^- (.+)$/gm, "<li>$1</li>");
  out = out.replace(/(<li>[\s\S]+?<\/li>\n?)+/g, "<ul>$&</ul>");
  // Paragraphs: blank-line delimited plain text blocks
  const blocks = out.split(/\n\n+/).map((b) => {
    const trimmed = b.trim();
    if (!trimmed) return "";
    if (/^<(h[1-6]|ul|ol|div|p|blockquote|pre|figure|table)/.test(trimmed)) return trimmed;
    return `<p>${trimmed.replace(/\n/g, " ")}</p>`;
  });
  return blocks.join("\n");
}

async function main() {
  const lines: string[] = [];
  lines.push("-- Auto-generated. Do not edit. Regenerate with: npm run cf:generate-seed");
  lines.push("");
  lines.push("BEGIN TRANSACTION;");
  lines.push("");

  // --- posts ---
  let postCount = 0;
  const clusters = fs.existsSync(POSTS_DIR) ? fs.readdirSync(POSTS_DIR).filter((f) => fs.statSync(path.join(POSTS_DIR, f)).isDirectory()) : [];
  for (const cluster of clusters) {
    const dir = path.join(POSTS_DIR, cluster);
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"))) {
      const slug = file.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data, content } = matter(raw);
      const html = await compileMdxToHtml(content);
      const now = new Date().toISOString();
      const citations = null; // seed doesn't have per-post citation extraction; new posts from n8n will
      const reviewNotes = data.reviewNotes ? JSON.stringify(data.reviewNotes) : null;
      const publishedAt = (data.publishedAt as string) ?? now;
      const updatedAt = (data.updatedAt as string) ?? publishedAt;
      const status = "published";
      lines.push(
        `INSERT OR REPLACE INTO posts (slug, cluster, title, description, keyword, html, raw_mdx, citations, review_notes, status, published_at, updated_at) VALUES (${esc(slug)}, ${esc(cluster)}, ${esc(data.title ?? slug)}, ${esc(data.description ?? null)}, ${esc(data.keyword ?? null)}, ${esc(html)}, ${esc(content)}, ${esc(citations)}, ${esc(reviewNotes)}, ${esc(status)}, ${esc(publishedAt)}, ${esc(updatedAt)});`,
      );
      postCount++;
    }
  }

  lines.push("");
  lines.push("-- topics --");

  // --- topics ---
  let topicCount = 0;
  if (fs.existsSync(TOPICS_CSV)) {
    const csv = fs.readFileSync(TOPICS_CSV, "utf8");
    const rows = parse(csv, { columns: true, skip_empty_lines: true }) as Record<string, string>[];
    for (const r of rows) {
      const kd = r.keyword_difficulty === "" || r.keyword_difficulty === undefined ? null : Number(r.keyword_difficulty);
      const cpc = r.cpc === "" || r.cpc === undefined ? null : Number(r.cpc);
      lines.push(
        `INSERT OR REPLACE INTO topics (slug, cluster, title, keyword, search_volume, keyword_difficulty, cpc, priority_score, intent, status, published_at, url) VALUES (${esc(r.slug)}, ${esc(r.cluster)}, ${esc(r.title)}, ${esc(r.keyword ?? "")}, ${Number(r.search_volume ?? 0)}, ${kd === null ? "NULL" : kd}, ${cpc === null ? "NULL" : cpc}, ${Number(r.priority_score ?? 0)}, ${esc(r.intent ?? null)}, ${esc(r.status ?? "pending")}, ${esc(r.published_at || null)}, ${esc(r.url || null)});`,
      );
      topicCount++;
    }
  }

  lines.push("");
  lines.push("COMMIT;");
  fs.writeFileSync(OUT_SQL, lines.join("\n"));
  console.log(`Wrote ${OUT_SQL}: ${postCount} posts, ${topicCount} topics.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
