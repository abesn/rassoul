import Link from "next/link";
import { notFound } from "next/navigation";
import { CLUSTERS, getPostsByCluster, type ClusterSlug } from "@/lib/posts";

export const runtime = "edge";

function isValidCluster(c: string): c is ClusterSlug {
  return (CLUSTERS as readonly { slug: string }[]).some((cl) => cl.slug === c);
}

export async function generateMetadata({ params }: { params: Promise<{ cluster: string }> }) {
  const { cluster } = await params;
  const meta = CLUSTERS.find((c) => c.slug === cluster);
  if (!meta) return {};
  return {
    title: meta.label,
    description: `${meta.label} — source-grounded articles on rassoul.org.`,
  };
}

export default async function ClusterPage({ params }: { params: Promise<{ cluster: string }> }) {
  const { cluster } = await params;
  if (!isValidCluster(cluster)) return notFound();
  const meta = CLUSTERS.find((c) => c.slug === cluster)!;
  const posts = await getPostsByCluster(cluster);

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-brand-500 font-medium">Cluster</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tightest">{meta.label}</h1>
        <p className="text-slate-500">
          {posts.length} {posts.length === 1 ? "post" : "posts"}
        </p>
      </header>

      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
          <p className="text-slate-500">No posts published yet in this cluster.</p>
          <p className="mt-2 text-sm text-slate-400">The daily n8n workflow will fill this in.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {posts.map((p) => (
            <li key={p.slug}>
              <Link
                href={p.url}
                className="block h-full rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-brand-500 group"
              >
                <h2 className="text-base font-medium group-hover:text-brand-500">{p.title}</h2>
                {p.description && <p className="mt-2 text-sm text-slate-500 line-clamp-2">{p.description}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
