import type { MetadataRoute } from "next";
import { getAllPostSlugs, CLUSTERS } from "@/lib/posts";
import { getEnv } from "@/lib/d1";

export const runtime = "edge";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = getEnv().NEXT_PUBLIC_SITE_URL ?? "https://rassoul.org";
  const posts = await getAllPostSlugs();
  const now = new Date();
  return [
    { url: `${site}/`, lastModified: now, changeFrequency: "daily", priority: 1 },
    ...CLUSTERS.map((c) => ({
      url: `${site}/${c.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...posts.map((p) => ({
      url: `${site}/${p.cluster}/${p.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    })),
  ];
}
