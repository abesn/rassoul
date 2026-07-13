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
import {
  searchQuran,
  searchSunnah,
  formatSourcesForPrompt,
  type QuranVerse,
  type Hadith,
} from "../lib/sources";
import { CLUSTERS } from "../lib/posts";
import { generateContent, defaultModel, llmProvider } from "../lib/llm";

const ROOT = path.resolve(__dirname, "..");
const TOPICS_CSV = path.join(ROOT, "content", "topics.csv");
const POSTS_DIR = path.join(ROOT, "content", "posts");
const DRY_RUN = process.argv.includes("--dry-run");

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
      // Look forward 500 chars for any recognized citation anchor:
      //   - <Citation> tag                                    (Anthropic-shape)
      //   - <Arabic> block (verbatim primary-source text)
      //   - sunnah.com / quran.com URL (in a markdown link)
      //   - Parenthetical source, e.g. "(Sahih al-Bukhari)",
      //     "(Bukhari 3641)", "(Muslim)", "(Quran 55:1)",
      //     "(Surah Al-Fatiha 1)"                             (DeepSeek-shape)
      const windowEnd = Math.min(mdx.length, attributionStart + 500);
      const windowStr = mdx.slice(attributionStart, windowEnd);
      const hasCitation =
        /<Citation\b/.test(windowStr) ||
        /<Arabic\b/.test(windowStr) ||
        /https?:\/\/sunnah\.com\//.test(windowStr) ||
        /https?:\/\/quran\.com\//.test(windowStr) ||
        /\([^)]*(?:sahih[\s-]+(?:al[\s-]+)?bukhari|sahih[\s-]+muslim|(?:^|[^a-z])bukhari|(?:^|[^a-z])muslim|tirmidhi|abu[\s-]+dawu(?:d|d)|nasa[\s']?i|nasai|ibn[\s-]+majah|sunan|musnad|muwatta|ahmad|quran|qur['’]?an|surah?|ayah?|(?:^|[^a-z])q\s*\d+:\d+)[^)]*\)/i.test(windowStr);

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

/**
 * Auto-fix a common LLM MDX bug: emitting `<Arabic>{unquoted-arabic}</Arabic>`
 * where the braces contain raw non-JS text. MDX parses `{...}` as a JavaScript
 * expression, so Arabic (or any non-JS text) inside bare braces fails to
 * compile. We wrap the content as a proper string literal.
 *
 * `<Arabic>{وَٱذْكُرْنَ}</Arabic>` → `<Arabic>{"وَٱذْكُرْنَ"}</Arabic>`
 *
 * Content that's already properly quoted (or a template literal) is left alone.
 */
function fixArabicBlocks(mdx: string): { fixed: string; count: number } {
  let count = 0;
  // Match ANY <Arabic>...</Arabic> pair (single-line or multi-line, non-greedy).
  // We don't require balanced braces because LLMs sometimes emit malformed
  // blocks like `<Arabic>{"...</Arabic>` (opening brace/quote, no closer).
  // Instead: extract the inner text, aggressively strip leading `{`, `{"`,
  // `{'`, and trailing `"}`, `'}`, `}` — then rewrap as a proper JS string
  // literal in JSX braces. This is idempotent for already-correct blocks.
  const anyBlock = /<Arabic>([\s\S]+?)<\/Arabic>/g;
  const fixed = mdx.replace(anyBlock, (whole, raw) => {
    const trimmed = raw.trim();
    // If it's already a proper JSX string literal, leave alone.
    if (/^\{\s*(?:"[^"]*"|'[^']*'|`[^`]*`)\s*\}$/.test(trimmed)) {
      return whole;
    }
    // Extract just the Arabic text: strip any leading `{"`/`{'`/`{` and
    // trailing `"}`/`'}`/`}` combos.
    let inner = trimmed;
    inner = inner.replace(/^\{\s*["'`]?/, "");
    inner = inner.replace(/["'`]?\s*\}$/, "");
    inner = inner.trim();
    if (!inner) return whole;
    count++;
    const safe = inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `<Arabic>{"${safe}"}</Arabic>`;
  });
  return { fixed, count };
}

/**
 * LLMs occasionally emit JSON-escaped attribute quotes in JSX tags:
 *   <Citation source=\"Quran\" number=\"55:1\" />
 * The `\"` breaks MDX's JSX parser. Strip stray backslashes from quote
 * characters INSIDE any JSX tag body.
 */
function fixEscapedJsxAttrs(mdx: string): { fixed: string; count: number } {
  let count = 0;
  const fixed = mdx.replace(
    /<([A-Z][A-Za-z]*|Arabic|Citation)\b([^>]*?)\/?>/g,
    (whole, tag, attrs) => {
      if (!attrs.includes('\\"')) return whole;
      count++;
      const cleaned = attrs.replace(/\\"/g, '"');
      return whole.replace(attrs, cleaned);
    },
  );
  return { fixed, count };
}

/**
 * MDX-safe autolink normalisation.
 *
 * Plain markdown allows `<https://example.com>` as an autolink, but MDX
 * interprets `<` as the start of a JSX tag. Since URLs contain `/`, MDX
 * throws "Unexpected character `/` before local name". Strip the angle
 * brackets — the URL alone still auto-links in markdown.
 */
function fixMdxAutolinks(mdx: string): { fixed: string; count: number } {
  let count = 0;
  const fixed = mdx.replace(/<(https?:\/\/[^>\s]+)>/g, (_, url) => {
    count++;
    return url;
  });
  return { fixed, count };
}

/**
 * Cheap syntactic sanity check for the MDX we're about to write.
 * Not a full MDX parse — that's expensive and requires the full toolchain —
 * but catches the specific patterns we've seen LLMs produce that fail
 * downstream in next-mdx-remote. Returns [] when the MDX looks safe.
 */
function findMdxSyntaxIssues(mdx: string): string[] {
  const issues: string[] = [];

  // 1. `<Arabic>{...}</Arabic>` where the contents are not a string literal.
  //    (Should already be auto-fixed above, but double-check.)
  const badArabic = /<Arabic>\{([^}]+)\}<\/Arabic>/g;
  let m: RegExpExecArray | null;
  while ((m = badArabic.exec(mdx))) {
    const inner = m[1].trim();
    const looksLikeString =
      (inner.startsWith('"') && inner.endsWith('"')) ||
      (inner.startsWith("'") && inner.endsWith("'")) ||
      (inner.startsWith("`") && inner.endsWith("`"));
    if (!looksLikeString) {
      issues.push(`Unquoted <Arabic> block: "${inner.slice(0, 60)}…"`);
    }
  }

  // 2. Stray unclosed `<Arabic>` or `<Citation>` tags — a heuristic for
  //    unbalanced JSX that will crash the MDX compiler.
  const arabicOpen = (mdx.match(/<Arabic\b/g) || []).length;
  const arabicClose = (mdx.match(/<\/Arabic>/g) || []).length;
  if (arabicOpen !== arabicClose) {
    issues.push(`Unbalanced <Arabic> tags: ${arabicOpen} opens vs ${arabicClose} closes`);
  }

  return issues;
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

  const rawMdx = await generateContent({
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userPrompt }],
    maxTokens: 4096,
  });

  // Auto-fix common LLM MDX bugs BEFORE validation:
  //   1. <Arabic>{unquoted}</Arabic> and unclosed variants → <Arabic>{"quoted"}</Arabic>
  //   2. <https://url> autolinks (invalid JSX)             → plain URL
  //   3. JSON-escaped attributes <Tag attr=\"v\" />        → <Tag attr="v" />
  const arabicFix = fixArabicBlocks(rawMdx);
  const autolinkFix = fixMdxAutolinks(arabicFix.fixed);
  const escapeFix = fixEscapedJsxAttrs(autolinkFix.fixed);
  const mdx = escapeFix.fixed;
  const autofixCount = arabicFix.count + autolinkFix.count + escapeFix.count;

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

  // 3) MDX syntax sanity check. Any post that would fail the Next.js build is
  //    treated as needs_review — auto-merge stays off until a human eyeballs it.
  //    (Merging a syntactically broken post would take the whole site down.)
  const syntaxIssues = findMdxSyntaxIssues(mdx);
  if (syntaxIssues.length) {
    valid = false;
    for (const s of syntaxIssues) notes.push(`MDX syntax: ${s}`);
  }

  // Note when we auto-fixed something so it shows up in the summary log.
  // Avoid literal "<Arabic>" in the note text — it would trip a re-run of
  // the fixer if someone reprocesses the file with frontmatter included.
  if (autofixCount > 0) {
    notes.push(`Auto-fixed ${autofixCount} MDX bug(s) in generated output.`);
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
  const provider = llmProvider();
  const model = defaultModel();
  console.log(`LLM: ${provider} · ${model}`);

  if (!DRY_RUN) {
    if (provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic. Use --dry-run to validate the pipeline only.");
    }
    if (provider === "deepseek" && !process.env.DEEPSEEK_API_KEY) {
      throw new Error("DEEPSEEK_API_KEY is required when LLM_PROVIDER=deepseek. Use --dry-run to validate the pipeline only.");
    }
  }

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
      const { mdx, valid, notes } = await generateOnePost(topic);
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
