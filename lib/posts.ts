/**
 * Post + topic queries against D1.
 * Every function here runs at edge request time (no filesystem, no build-time cache).
 */
import { getDB } from "./d1";

export type Post = {
  slug: string;
  cluster: string;
  title: string;
  description?: string;
  keyword?: string;
  html: string;
  citations?: string[];
  reviewNotes?: string[];
  status: string;
  publishedAt: string;
  updatedAt: string;
  url: string;
};

export type Topic = {
  slug: string;
  cluster: string;
  title: string;
  keyword: string;
  searchVolume: number;
  keywordDifficulty: number | null;
  cpc: number | null;
  priorityScore: number;
  intent: string | null;
  status: string;
  publishedAt: string | null;
  url: string | null;
};

export const CLUSTERS = [
  { slug: "duas", label: "Duas" },
  { slug: "sirah", label: "Sirah" },
  { slug: "hadith", label: "Hadith" },
  { slug: "names-of-allah", label: "99 Names of Allah" },
  { slug: "names-of-the-messenger", label: "Names of the Messenger ﷺ" },
  { slug: "quran", label: "Quran" },
  { slug: "sunnah", label: "Sunnah" },
  { slug: "ramadan", label: "Ramadan" },
  { slug: "hajj", label: "Hajj" },
  { slug: "dawah", label: "Da'wah" },
] as const;

export type ClusterSlug = (typeof CLUSTERS)[number]["slug"];

type PostRow = {
  slug: string;
  cluster: string;
  title: string;
  description: string | null;
  keyword: string | null;
  html: string;
  citations: string | null;
  review_notes: string | null;
  status: string;
  published_at: string;
  updated_at: string;
};

function rowToPost(r: PostRow): Post {
  return {
    slug: r.slug,
    cluster: r.cluster,
    title: r.title,
    description: r.description ?? undefined,
    keyword: r.keyword ?? undefined,
    html: r.html,
    citations: r.citations ? (JSON.parse(r.citations) as string[]) : undefined,
    reviewNotes: r.review_notes ? (JSON.parse(r.review_notes) as string[]) : undefined,
    status: r.status,
    publishedAt: r.published_at,
    updatedAt: r.updated_at,
    url: `/${r.cluster}/${r.slug}`,
  };
}

export async function getAllPosts(limit = 200): Promise<Post[]> {
  const db = getDB();
  const { results } = await db
    .prepare("SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC LIMIT ?")
    .bind(limit)
    .all<PostRow>();
  return (results ?? []).map(rowToPost);
}

export async function getPostsByCluster(cluster: string, limit = 100): Promise<Post[]> {
  const db = getDB();
  const { results } = await db
    .prepare(
      "SELECT * FROM posts WHERE cluster = ? AND status = 'published' ORDER BY published_at DESC LIMIT ?",
    )
    .bind(cluster, limit)
    .all<PostRow>();
  return (results ?? []).map(rowToPost);
}

export async function getPost(cluster: string, slug: string): Promise<Post | null> {
  const db = getDB();
  const row = await db
    .prepare("SELECT * FROM posts WHERE cluster = ? AND slug = ?")
    .bind(cluster, slug)
    .first<PostRow>();
  return row ? rowToPost(row) : null;
}

export async function getPostSlugsByCluster(cluster: string): Promise<string[]> {
  const db = getDB();
  const { results } = await db
    .prepare("SELECT slug FROM posts WHERE cluster = ? AND status = 'published'")
    .bind(cluster)
    .all<{ slug: string }>();
  return (results ?? []).map((r) => r.slug);
}

export async function getAllPostSlugs(): Promise<{ cluster: string; slug: string }[]> {
  const db = getDB();
  const { results } = await db
    .prepare("SELECT cluster, slug FROM posts WHERE status = 'published'")
    .all<{ cluster: string; slug: string }>();
  return results ?? [];
}

type TopicRow = {
  slug: string;
  cluster: string;
  title: string;
  keyword: string;
  search_volume: number;
  keyword_difficulty: number | null;
  cpc: number | null;
  priority_score: number;
  intent: string | null;
  status: string;
  published_at: string | null;
  url: string | null;
};

function rowToTopic(r: TopicRow): Topic {
  return {
    slug: r.slug,
    cluster: r.cluster,
    title: r.title,
    keyword: r.keyword,
    searchVolume: r.search_volume,
    keywordDifficulty: r.keyword_difficulty,
    cpc: r.cpc,
    priorityScore: r.priority_score,
    intent: r.intent,
    status: r.status,
    publishedAt: r.published_at,
    url: r.url,
  };
}

export async function getTopicsByCluster(cluster: string): Promise<Topic[]> {
  const db = getDB();
  const { results } = await db
    .prepare("SELECT * FROM topics WHERE cluster = ? ORDER BY priority_score DESC")
    .bind(cluster)
    .all<TopicRow>();
  return (results ?? []).map(rowToTopic);
}

/** Pick top-priority pending topic per cluster. Used by /api/admin/topics-next-batch. */
export async function pickDailyBatch(): Promise<Topic[]> {
  const db = getDB();
  const picks: Topic[] = [];
  for (const cluster of CLUSTERS) {
    const row = await db
      .prepare(
        "SELECT * FROM topics WHERE cluster = ? AND status = 'pending' ORDER BY priority_score DESC LIMIT 1",
      )
      .bind(cluster.slug)
      .first<TopicRow>();
    if (row) picks.push(rowToTopic(row));
  }
  return picks;
}
