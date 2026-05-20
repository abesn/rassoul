import type { MetadataRoute } from "next";
import { getAllPosts, CLUSTERS } from "@/lib/posts";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";

export default function sitemap(): MetadataRoute.Sitemap {
  const posts = getAllPosts();
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1.0 },
    ...CLUSTERS.map((c) => ({
      url: `${SITE_URL}/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({
      url: `${SITE_URL}${p.url}`,
      lastModified: p.updatedAt ? new Date(p.updatedAt) : now,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ];
}
