import Link from "next/link";
import { getAllPosts, getPostsByCluster, CLUSTERS } from "@/lib/posts";

export default function HomePage() {
  const all = getAllPosts();
  const latest = all.slice(0, 8);

  return (
    <div className="space-y-12">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Rassoul</h1>
        <p className="mt-3 max-w-2xl text-stone-600 dark:text-stone-300">
          Source-grounded da&apos;wah content. Every hadith carries its collection and number;
          every ayah links to its surah and verse. Built for readers who want to verify.
        </p>
      </section>

      {latest.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
            Latest
          </h2>
          <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-800">
            {latest.map((p) => (
              <li key={p.slug} className="py-4">
                <Link href={p.url} className="block group">
                  <span className="text-xs uppercase tracking-wide text-emerald-600">
                    {p.cluster.replace(/-/g, " ")}
                  </span>
                  <h3 className="mt-1 text-lg font-medium group-hover:text-emerald-700">
                    {p.title}
                  </h3>
                  {p.description && (
                    <p className="mt-1 text-sm text-stone-500 line-clamp-2">{p.description}</p>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">
          Explore by topic
        </h2>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
          {CLUSTERS.map((c) => {
            const count = getPostsByCluster(c.slug).length;
            return (
              <Link
                key={c.slug}
                href={`/${c.slug}`}
                className="block rounded-lg border border-stone-200 dark:border-stone-800 p-4 hover:border-emerald-500"
              >
                <div className="font-medium">{c.label}</div>
                <div className="text-xs text-stone-500 mt-1">
                  {count} {count === 1 ? "post" : "posts"}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
