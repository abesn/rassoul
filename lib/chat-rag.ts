/**
 * Retrieval for the /api/chat endpoint.
 *
 * Combines:
 *   1. Quran verses via quran.com search
 *   2. Hadith via sunnah.com search
 *   3. Local site content: keyword-match posts in D1
 */
import { getDB, getEnv } from "./d1";

const QURAN_BASE = "https://api.quran.com/api/v4";
const SUNNAH_BASE = "https://api.sunnah.com/v1";

export type QuranVerse = { surah: number; ayah: number; arabic: string; english: string; reference: string; url: string };
export type Hadith = { collection: string; hadithNumber: string; arabic: string; english: string; reference: string; url: string };
export type LocalSource = { title: string; cluster: string; url: string; excerpt: string };

export type ChatRetrieval = { verses: QuranVerse[]; hadiths: Hadith[]; localPosts: LocalSource[] };

const STOPWORDS = new Set([
  "the","and","for","with","that","this","from","his","her","was","were","are","but","not","you","they","what","when","who","how","why","all","any","did","have","has","had","him","she","their","them","its",
]);

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'ﷺ ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

export async function searchQuran(query: string, limit = 5): Promise<QuranVerse[]> {
  const url = `${QURAN_BASE}/search?q=${encodeURIComponent(query)}&size=${limit}&language=en`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = (await res.json()) as { search?: { results?: { verse_key: string; text: string; translations?: { text: string }[] }[] } };
  return (data.search?.results ?? []).map((r) => {
    const [s, a] = r.verse_key.split(":").map(Number);
    return { surah: s, ayah: a, arabic: r.text, english: r.translations?.[0]?.text ?? "", reference: `Quran ${s}:${a}`, url: `https://quran.com/${s}/${a}` };
  });
}

export async function searchSunnah(query: string, limit = 5): Promise<Hadith[]> {
  const key = getEnv().SUNNAH_API_KEY;
  if (!key) {
    return [{ collection: "sunnah.com search", hadithNumber: "", arabic: "", english: `[SUNNAH_API_KEY not set — verify on sunnah.com search]`, reference: `sunnah.com search: ${query}`, url: `https://sunnah.com/search?q=${encodeURIComponent(query)}` }];
  }
  const res = await fetch(`${SUNNAH_BASE}/hadiths?q=${encodeURIComponent(query)}&limit=${limit}`, {
    headers: { "X-API-Key": key, Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: { collection: string; hadithNumber: string; hadithArabic: string; hadithEnglish: string }[] };
  return (data.data ?? []).map((h) => ({ collection: h.collection, hadithNumber: h.hadithNumber, arabic: h.hadithArabic, english: h.hadithEnglish, reference: `${h.collection} ${h.hadithNumber}`, url: `https://sunnah.com/${h.collection}:${h.hadithNumber}` }));
}

/** Simple keyword-match against post titles + first-paragraph excerpts in D1. */
async function searchLocalCorpus(query: string, k = 3): Promise<LocalSource[]> {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const db = getDB();
  // Build a WHERE clause with OR-ed LIKE conditions for the top few tokens
  const topTokens = qTokens.slice(0, 4);
  const conditions = topTokens.map(() => "(title LIKE ? OR description LIKE ?)").join(" OR ");
  const bindings = topTokens.flatMap((t) => [`%${t}%`, `%${t}%`]);
  const { results } = await db
    .prepare(
      `SELECT slug, cluster, title, description FROM posts
       WHERE status = 'published' AND (${conditions})
       LIMIT ?`,
    )
    .bind(...bindings, k)
    .all<{ slug: string; cluster: string; title: string; description: string | null }>();
  return (results ?? []).map((r) => ({
    title: r.title,
    cluster: r.cluster,
    url: `/${r.cluster}/${r.slug}`,
    excerpt: r.description ?? "",
  }));
}

export async function retrieveForQuestion(question: string): Promise<ChatRetrieval> {
  const [verses, hadiths, localPosts] = await Promise.all([
    searchQuran(question, 4).catch(() => []),
    searchSunnah(question, 6).catch(() => []),
    searchLocalCorpus(question, 3).catch(() => []),
  ]);
  return { verses, hadiths, localPosts };
}

export function formatRetrievalForPrompt(r: ChatRetrieval, siteUrl: string): string {
  const lines: string[] = [];
  if (r.verses.length) {
    lines.push("## Verified Quran verses");
    for (const v of r.verses) {
      lines.push(`- ${v.reference} — ${v.url}`);
      if (v.english) lines.push(`  English: "${v.english.replace(/\s+/g, " ").trim()}"`);
    }
  }
  if (r.hadiths.length) {
    lines.push("", "## Verified hadiths");
    for (const h of r.hadiths) {
      lines.push(`- ${h.reference} — ${h.url}`);
      if (h.english) lines.push(`  English: "${h.english.replace(/\s+/g, " ").trim().slice(0, 500)}"`);
    }
  }
  if (r.localPosts.length) {
    lines.push("", "## Relevant articles already on rassoul.org");
    for (const p of r.localPosts) {
      lines.push(`- ${p.title} — ${siteUrl}${p.url}`);
      if (p.excerpt) lines.push(`  Excerpt: "${p.excerpt.replace(/\s+/g, " ").trim().slice(0, 300)}"`);
    }
  }
  if (lines.length === 0) lines.push("No sources retrieved. Decline to answer and refer the user to a qualified scholar or sunnah.com directly.");
  return lines.join("\n");
}
