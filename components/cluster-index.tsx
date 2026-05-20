import Link from "next/link";
import { CLUSTERS, getPostsByCluster, type ClusterSlug } from "@/lib/posts";

export function ClusterIndex({ cluster }: { cluster: ClusterSlug }) {
  const posts = getPostsByCluster(cluster);
  const meta = CLUSTERS.find((c) => c.slug === cluster);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight">{meta?.label}</h1>
        <p className="mt-2 text-stone-500">{posts.length} posts</p>
      </header>
      {posts.length === 0 ? (
        <p className="text-stone-500">
          No posts published yet in this cluster. The weekly content loop will fill this in.
        </p>
      ) : (
        <ul className="divide-y divide-stone-200 dark:divide-stone-800">
          {posts.map((p) => (
            <li key={p.slug} className="py-4">
              <Link href={p.url} className="block group">
                <h2 className="text-lg font-medium group-hover:text-emerald-700">{p.title}</h2>
                {p.description && (
                  <p className="mt-1 text-sm text-stone-500 line-clamp-2">{p.description}</p>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
