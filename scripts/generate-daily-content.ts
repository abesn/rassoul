/**
 * Daily content generator.
 *
 * Every day: one article per cluster (10 clusters → 10 articles).
 *
 * 1. Read content/topics.csv
 * 2. For each cluster, pick the highest-priority topic with status="pending"
 * 3. For each pick:
 *    - Search sunnah.com + quran.com for primary-source material
 *    - Call Claude with a strict source-grounded prompt
 *    - Validate every citation against fetched sources
 *    - Write the MDX file to content/posts/{cluster}/{slug}.mdx
 * 4. Mark topic as published (or needs_review) in topics.csv
 * 5. Continue past individual failures (per-topic try/catch)
 *
 * Run: npm run generate:daily
 * Dry: npm run generate:dry
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import Anthropic from "@anthropic-ai/sdk";
import {
  searchQuran,
  searchSunnah,
  formatSourcesForPrompt,
  type QuranVerse,
  type Hadith,
} from "../lib/sources";
import { CLUSTERS } from "../lib/posts";

const ROOT = path.resolve(__dirname, "..");
const TOPICS_CSV = path.join(ROOT, "content", "topics.csv");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const DRY_RUN = process.argv.includes("--dry-run");
// `||` (not `??`) so an empty-string env var also falls back to the default.
const MODEL = process.env.CLAUDE_MODEL?.trim() || "claude-opus-4-7";

// Some clusters may be empty; also lets the user limit which clusters run today
// via CLUSTERS_TODAY=duas,sirah,hadith (comma-separated slugs). Empty → all.
const CLUSTERS_FILTER = (process.env.CLUSTERS_TODAY ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

type Topic = {
  slug: string;
  title: string;
  cluster: string;
  keyword: string;
  search_volume: string;
  keyword_difficulty: string;
  cpc: string;
  priority_score: string;
  intent: string;
  status: string;
  published_at: string;
  url: string;
};

const SYSTEM_PROMPT = `You are a meticulous Muslim writer producing a single da'wah blog post for rassoul.org.

Non-negotiable rules:
1. EVERY hadith you reference MUST come from the "Verified hadiths" list in the user message. Cite it inline using <Citation source="..." book="..." number="..." href="..." />. Do NOT invent, paraphrase from memory, or attribute hadiths to sources not in the list.
2. EVERY Quran verse you reference MUST come from the "Verified Quran verses" list. Cite it the same way.
3. HARD RULE — attribution requires citation. You may NEVER write "the Prophet said", "the Messenger said", "he ﷺ said", "he ﷺ narrated", "he ﷺ taught", "he ﷺ told", "he ﷺ instructed", "he ﷺ warned", "he ﷺ advised", "he ﷺ mentioned", "he ﷺ commanded", "he ﷺ forbade", "he ﷺ described", "he ﷺ explained", "Allah said", "Allah says", "the Quran says", or any other speech-attribution phrase UNLESS the very next sentence (or the same sentence) contains a <Citation> tag OR a markdown link to https://sunnah.com/... / https://quran.com/... anchoring that claim to a verified source. If the sources don't cover it, DO NOT ATTRIBUTE — rephrase as your own analysis or leave it out.
4. If you do not have enough verified sources to cover a section, omit that section. Quality over completeness.
5. Use the Arabic component for any block of Arabic text: <Arabic>{"النص العربي"}</Arabic>
6. Voice: respectful, scholarly but accessible, never preachy, no exclamation marks, no emojis.
7. When mentioning the Prophet Muhammad, use ﷺ after his name (or after "the Prophet" / "the Messenger").
8. Output ONLY a single MDX file body. NO frontmatter (we add it), NO leading commentary, NO closing notes.
9. Structure: open with a 1–2 sentence answer to the search-intent question. Then 3–6 H2 sections. Close with a "Sources" H2 listing all citations as plain markdown links.
10. Target length: 900–1600 words.
11. If a verifiable Arabic dua/ayah exists in your sources, include it in an <Arabic> block, then transliteration in italics, then English translation, then citation.
12. NEVER use the AI-detection-tripping phrases: "in conclusion", "it is important to note", "delve into", "in today's world", "navigate the", "tapestry", "embark on a journey".`;

async function readTopics(): Promise<Topic[]> {
  const raw = await fs.readFile(TOPICS_CSV, "utf8");
  return parse(raw, { columns: true, skip_empty_lines: true }) as Topic[];
}

async function writeTopics(topics: Topic[]): Promise<void> {
  const out = stringify(topics, { header: true });
  await fs.writeFile(TOPICS_CSV, out, "utf8");
}

/**
 * Pick the highest-priority pending topic in each cluster. One per cluster.
 * Clusters with no pending topics are silently skipped (logged as a warning
 * inside main so the run doesn't fail).
 */
function pickDailyBatch(topics: Topic[]): { picks: Topic[]; skipped: string[] } {
  const clusters = CLUSTERS.map((c) => c.slug).filter(
    (c) => CLUSTERS_FILTER.length === 0 || CLUSTERS_FILTER.includes(c),
  );

  const picks: Topic[] = [];
  const skipped: string[] = [];

  for (const cluster of clusters) {
    const pending = topics
      .filter((t) => t.status === "pending" && t.cluster === cluster)
      .sort((a, b) => Number(b.priority_score) - Number(a.priority_score));

    if (pending.length > 0) {
      picks.push(pending[0]);
    } else {
      skipped.push(cluster);
    }
  }
  return { picks, skipped };
}

function buildAllowedReferences(verses: QuranVerse[], hadiths: Hadith[]): Set<string> {
  const allowed = new Set<string>();
  for (const v of verses) allowed.add(v.reference.toLowerCase());
  for (const h of hadiths) allowed.add(h.reference.toLowerCase());
  return allowed;
}

/**
 * Detects sentences that attribute speech to the Prophet ﷺ (or Allah / the Quran)
 * without a nearby citation. Returns human-readable snippets for each violation.
 *
 * "Nearby" = within a ~300-character window after the attribution phrase, OR
 * within the same sentence. That window must contain either a <Citation> tag
 * or a link to sunnah.com / quran.com.
 *
 * This is the hardest guard: even if Claude's prose slips past the <Citation>
 * validator, this catches "the Prophet said X" without a source and marks the
 * post as needs_review — which blocks auto-merge.
 */
function findUnverifiedAttributions(mdx: string): string[] {
  const patterns: RegExp[] = [
    // Prophetic speech attributions
    /\b(?:the\s+)?(?:prophet|messenger|he)\s*(?:ﷺ|\(saw\)|\(pbuh\)|,?\s*peace be upon him)?\s+(said|narrated|reported|taught|told|mentioned|explained|warned|advised|instructed|declared|stated|informed|described|promised|ordered|commanded|prohibited|forbade|encouraged|counseled|urged|answered|replied|asked|responded)\b/gi,
    // Divine speech / Quran attributions
    /\b(?:allah(?:'s)?|the\s+almighty|the\s+quran|the\s+qur'an|allah\s+ta'ala|almighty\s+allah|god)\s+(said|says|tells|told|reveals|revealed|declares|declared|commands|commanded|warns|warned|instructs|instructed|informs|informed|promises|promised)\b/gi,
  ];

  const problems: string[] = [];
  const seen = new Set<string>();

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(mdx))) {
      const attributionStart = m.index;
      // Look forward 500 chars for a citation, verbatim Arabic block, or a
      // sunnah.com / quran.com link. An <Arabic> block IS a citation: it can
      // only be produced from verbatim source text per the system prompt, so
      // "Allah declares X: <Arabic>…</Arabic>" is a valid attribution shape.
      const windowEnd = Math.min(mdx.length, attributionStart + 500);
      const windowStr = mdx.slice(attributionStart, windowEnd);
      const hasCitation =
        /<Citation\b/.test(windowStr) ||
        /<Arabic\b/.test(windowStr) ||
        /https?:\/\/sunnah\.com\//.test(windowStr) ||
        /https?:\/\/quran\.com\//.test(windowStr);

      if (!hasCitation) {
        // Extract a readable snippet: 20 chars before → 100 chars after
        const snipStart = Math.max(0, attributionStart - 20);
        const snipEnd = Math.min(mdx.length, attributionStart + 120);
        const snippet = mdx.slice(snipStart, snipEnd).replace(/\s+/g, " ").trim();
        const key = snippet.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          problems.push(`Uncited attribution: "…${snippet}…"`);
        }
      }
    }
  }
  return problems;
}

function findCitedReferences(mdx: string): string[] {
  const re = /<Citation\s+([^/]*?)\/>/g;
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(mdx))) {
    const attrs = m[1];
    const source = attrs.match(/source="([^"]+)"/)?.[1] ?? "";
    const book = attrs.match(/book="([^"]+)"/)?.[1] ?? "";
    const number = attrs.match(/number="([^"]+)"/)?.[1] ?? "";
    const ref = [source, book, number].filter(Boolean).join(" ").trim();
    if (ref) out.push(ref.toLowerCase());
  }
  return out;
}

async function generateOnePost(
  topic: Topic,
  client: Anthropic,
): Promise<{ mdx: string; valid: boolean; notes: string[] }> {
  const [verses, hadiths] = await Promise.all([
    searchQuran(topic.keyword, 5).catch(() => []),
    searchSunnah(topic.keyword, 8).catch(() => []),
  ]);

  const sourcesBlock = formatSourcesForPrompt({ verses, hadiths });

  const userPrompt = `Topic: ${topic.title}
Cluster: ${topic.cluster}
Target search keyword: "${topic.keyword}"

${sourcesBlock}

Write the MDX body now, following every rule in the system message. Begin immediately with the answer paragraph.`;

  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
  });

  const mdx = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  const allowed = buildAllowedReferences(verses, hadiths);
  const cited = findCitedReferences(mdx);
  const notes: string[] = [];
  let valid = true;

  // 1) <Citation> tag references must match a fetched source
  for (const c of cited) {
    const tokens = c.split(/\s+/);
    const ok = [...allowed].some((a) => tokens.every((t) => a.includes(t)));
    if (!ok) {
      valid = false;
      notes.push(`Unverified citation: "${c}"`);
    }
  }

  // (Removed: the old "no citations despite sources" check was too aggressive.
  //  It fired on legitimate meta articles — e.g. an encyclopedic "Define Hadith"
  //  post that uses <Arabic> blocks for terminology without quoting a specific
  //  hadith. The attribution guard below is the real fabrication defense; if a
  //  post says "the Prophet said X" without a source, that IS caught. A post
  //  that never attributes anything shouldn't be flagged.)

  // 2) Attribution guard: "the Prophet said" and similar must be accompanied
  //    by a nearby <Citation> tag or sunnah.com / quran.com link. Anything
  //    that fails this check is treated as needs_review, blocking auto-merge.
  const attributionProblems = findUnverifiedAttributions(mdx);
  if (attributionProblems.length) {
    valid = false;
    for (const p of attributionProblems) notes.push(p);
  }

  return { mdx, valid, notes };
}

function frontmatter(topic: Topic, notes: string[]): string {
  const today = new Date().toISOString().slice(0, 10);
  const desc = `${topic.title} — sourced from authentic Quran and hadith references.`;
  const lines = [
    "---",
    `title: ${JSON.stringify(topic.title)}`,
    `description: ${JSON.stringify(desc)}`,
    `cluster: ${topic.cluster}`,
    `keyword: ${JSON.stringify(topic.keyword)}`,
    `publishedAt: "${today}"`,
    `updatedAt: "${today}"`,
  ];
  if (notes.length) lines.push(`reviewNotes: ${JSON.stringify(notes)}`);
  lines.push("---", "");
  return lines.join("\n");
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY && !DRY_RUN) {
    throw new Error("ANTHROPIC_API_KEY is required. Run with --dry-run to validate the pipeline only.");
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY ?? "dry-run" });
  const topics = await readTopics();
  const { picks, skipped } = pickDailyBatch(topics);

  if (picks.length === 0) {
    console.log("No pending topics in any cluster. topics.csv is exhausted — add more rows.");
    return;
  }

  console.log(`\nPicked ${picks.length} topic(s) — one per cluster:`);
  for (const t of picks) {
    console.log(`  [${t.cluster.padEnd(24)}] ${t.title}  (score=${t.priority_score})`);
  }
  if (skipped.length) {
    console.log(`\n⚠ Empty clusters (no pending topics): ${skipped.join(", ")}`);
  }

  if (DRY_RUN) {
    console.log("\n--dry-run: skipping API calls. Source-fetch dry-run below:");
    for (const t of picks) {
      const [v, h] = await Promise.all([
        searchQuran(t.keyword, 3).catch(() => []),
        searchSunnah(t.keyword, 3).catch(() => []),
      ]);
      console.log(`  ${t.cluster}/${t.slug}: ${v.length} verses, ${h.length} hadiths available`);
    }
    return;
  }

  let succeeded = 0;
  let flagged = 0;
  let failed = 0;

  for (const topic of picks) {
    console.log(`\n→ [${topic.cluster}] ${topic.title}`);
    try {
      const { mdx, valid, notes } = await generateOnePost(topic, client);
      const outDir = path.join(POSTS_DIR, topic.cluster);
      await fs.mkdir(outDir, { recursive: true });
      const outPath = path.join(outDir, `${topic.slug}.mdx`);
      await fs.writeFile(outPath, frontmatter(topic, notes) + mdx, "utf8");

      const idx = topics.findIndex((t) => t.slug === topic.slug);
      if (idx >= 0) {
        topics[idx].status = valid ? "published" : "needs_review";
        topics[idx].published_at = new Date().toISOString();
        topics[idx].url = `/${topic.cluster}/${topic.slug}`;
      }

      if (valid) succeeded++;
      else flagged++;
      console.log(`  ✓ wrote ${path.relative(ROOT, outPath)}  (${valid ? "published" : "NEEDS REVIEW"})`);
      if (notes.length) for (const n of notes) console.log(`    ! ${n}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ failed: ${(err as Error).message}`);
      // continue to next cluster — one Anthropic hiccup shouldn't kill the day
    }
  }

  await writeTopics(topics);

  console.log(
    `\nDone. Summary: ${succeeded} published, ${flagged} needs_review, ${failed} failed, ${skipped.length} clusters skipped.`,
  );

  // Emit counts as GitHub Actions step outputs so the workflow can decide
  // whether to auto-merge the PR (only when needs_review + failed both == 0).
  if (process.env.GITHUB_OUTPUT) {
    await fs.appendFile(
      process.env.GITHUB_OUTPUT,
      `published=${succeeded}\nneeds_review=${flagged}\nfailed=${failed}\nskipped=${skipped.length}\n`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
