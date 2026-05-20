import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

export type Post = {
  slug: string;
  cluster: string;
  title: string;
  description?: string;
  keyword?: string;
  publishedAt?: string;
  updatedAt?: string;
  body: string;
  url: string;
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

const POSTS_DIR = path.join(process.cwd(), "content", "posts");

let cache: Post[] | null = null;

export function getAllPosts(): Post[] {
  if (cache) return cache;
  const out: Post[] = [];
  if (!fs.existsSync(POSTS_DIR)) {
    cache = [];
    return cache;
  }
  for (const cluster of fs.readdirSync(POSTS_DIR)) {
    const dir = path.join(POSTS_DIR, cluster);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".mdx")) continue;
      const slug = file.replace(/\.mdx$/, "");
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data, content } = matter(raw);
      out.push({
        slug,
        cluster,
        title: data.title ?? slug,
        description: data.description,
        keyword: data.keyword,
        publishedAt: data.publishedAt,
        updatedAt: data.updatedAt,
        body: content,
        url: `/${cluster}/${slug}`,
      });
    }
  }
  out.sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""));
  cache = out;
  return cache;
}

export function getPostsByCluster(cluster: string): Post[] {
  return getAllPosts().filter((p) => p.cluster === cluster);
}

export function getPost(cluster: string, slug: string): Post | undefined {
  return getAllPosts().find((p) => p.cluster === cluster && p.slug === slug);
}
