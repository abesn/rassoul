/**
 * Retrieval for the chat endpoint.
 *
 * Combines three corpora:
 *  1. Quran verses via quran.com search
 *  2. Hadith via sunnah.com search (or search-URL fallback)
 *  3. Local sirah/hadith MDX corpus on the site itself
 *
 * The local corpus is loaded once at process start. As the site grows,
 * this means the chatbot's answers grow richer — same content powers both.
 */
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { searchQuran, searchSunnah, type QuranVerse, type Hadith } from "./sources";

export type LocalSource = {
  title: string;
  cluster: string;
  url: string;
  excerpt: string;
};

const POSTS_DIR = path.join(process.cwd(), "content", "posts");
let localCorpus: Array<LocalSource & { tokens: Set<string> }> | null = null;

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9'ﷺ ]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "his", "her", "was", "were",
  "are", "but", "not", "you", "they", "what", "when", "who", "how", "why", "all",
  "any", "did", "have", "has", "had", "him", "she", "their", "them", "its",
]);

function loadLocalCorpus(): Array<LocalSource & { tokens: Set<string> }> {
  if (localCorpus) return localCorpus;
  const out: Array<LocalSource & { tokens: Set<string> }> = [];
  if (!fs.existsSync(POSTS_DIR)) {
    localCorpus = [];
    return localCorpus;
  }
  for (const cluster of fs.readdirSync(POSTS_DIR)) {
    const dir = path.join(POSTS_DIR, cluster);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".mdx")) continue;
      const slug = file.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data, content } = matter(raw);
      const excerpt = content.replace(/<[^>]+>/g, " ").replace(/[#*_>`]/g, " ").slice(0, 600);
      const tokens = new Set([...tokenize(data.title ?? ""), ...tokenize(content.slice(0, 4000))]);
      out.push({
        title: data.title ?? slug,
        cluster,
        url: `/${cluster}/${slug}`,
        excerpt,
        tokens,
      });
    }
  }
  localCorpus = out;
  return localCorpus;
}

function searchLocalCorpus(query: string, k = 3): LocalSource[] {
  const qTokens = tokenize(query);
  if (qTokens.length === 0) return [];
  const corpus = loadLocalCorpus();
  const scored = corpus
    .map((doc) => {
      const overlap = qTokens.filter((t) => doc.tokens.has(t)).length;
      return { doc, score: overlap };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
  return scored.map(({ doc }) => ({
    title: doc.title,
    cluster: doc.cluster,
    url: doc.url,
    excerpt: doc.excerpt,
  }));
}

export type ChatRetrieval = {
  verses: QuranVerse[];
  hadiths: Hadith[];
  localPosts: LocalSource[];
};

export async function retrieveForQuestion(question: string): Promise<ChatRetrieval> {
  const [verses, hadiths] = await Promise.all([
    searchQuran(question, 4).catch(() => []),
    searchSunnah(question, 6).catch(() => []),
  ]);
  const localPosts = searchLocalCorpus(question, 3);
  return { verses, hadiths, localPosts };
}

export function formatRetrievalForPrompt(r: ChatRetrieval, siteUrl: string): string {
  const sections: string[] = [];

  if (r.verses.length) {
    sections.push("## Verified Quran verses");
    for (const v of r.verses) {
      sections.push(`- ${v.reference} — ${v.url}`);
      if (v.english) sections.push(`  English: "${v.english.replace(/\s+/g, " ").trim()}"`);
    }
  }

  if (r.hadiths.length) {
    sections.push("");
    sections.push("## Verified hadiths");
    for (const h of r.hadiths) {
      sections.push(`- ${h.reference} — ${h.url}`);
      if (h.english) sections.push(`  English: "${h.english.replace(/\s+/g, " ").trim().slice(0, 500)}"`);
    }
  }

  if (r.localPosts.length) {
    sections.push("");
    sections.push("## Relevant articles already on rassoul.org");
    for (const p of r.localPosts) {
      sections.push(`- ${p.title} — ${siteUrl}${p.url}`);
      sections.push(`  Excerpt: "${p.excerpt.replace(/\s+/g, " ").trim().slice(0, 300)}"`);
    }
  }

  if (sections.length === 0) {
    sections.push("No sources retrieved for this question. You MUST decline to answer and direct the user to consult a qualified scholar or search sunnah.com directly.");
  }

  return sections.join("\n");
}
