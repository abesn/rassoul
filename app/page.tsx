import Link from "next/link";
import { getAllPosts, getPostsByCluster, CLUSTERS } from "@/lib/posts";

export const runtime = "edge";

export default async function HomePage() {
  const all = await getAllPosts(6);
  // Query counts in parallel for the cluster grid
  const counts = await Promise.all(
    CLUSTERS.map(async (c) => ({ ...c, count: (await getPostsByCluster(c.slug, 1000)).length })),
  );

  return (
    <div className="space-y-20">
      <section className="grid gap-6 md:gap-8">
        <div className="inline-flex items-center self-start rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700 dark:border-brand-700/40 dark:bg-brand-900/30 dark:text-brand-300">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 mr-2" />
          Source-grounded · Sunni · No fabricated hadith
        </div>
        <h1 className="text-4xl md:text-6xl font-display font-semibold tracking-tightest leading-[1.05]">
          Reflections on the
          <br />
          <span className="text-brand-500">Messenger ﷺ</span>, sourced.
        </h1>
        <p className="max-w-2xl text-lg text-slate-600 dark:text-slate-300">
          Every hadith carries its collection and number. Every ayah links to its surah and verse. Built for readers who
          want to verify before they believe.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/sirah" className="inline-flex items-center rounded-full bg-brand-500 text-white px-5 py-2.5 text-sm font-medium hover:bg-brand-600">
            Read the sirah →
          </Link>
          <Link href="/duas" className="inline-flex items-center rounded-full border border-slate-300 dark:border-slate-700 px-5 py-2.5 text-sm font-medium hover:border-brand-500 hover:text-brand-500">
            Browse duas
          </Link>
        </div>
      </section>

      {all.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-6">
            <h2 className="text-2xl font-display font-semibold tracking-tight">Latest</h2>
          </div>
          <ul className="grid gap-2 md:grid-cols-2">
            {all.map((p) => (
              <li key={`${p.cluster}-${p.slug}`}>
                <Link href={p.url} className="block rounded-xl border border-slate-200 dark:border-slate-800 p-5 hover:border-brand-500 group h-full">
                  <span className="text-[11px] uppercase tracking-wider text-brand-500 font-medium">
                    {p.cluster.replace(/-/g, " ")}
                  </span>
                  <h3 className="mt-2 text-base font-medium group-hover:text-brand-500">{p.title}</h3>
                  {p.description && <p className="mt-2 text-sm text-slate-500 line-clamp-2">{p.description}</p>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-6">
          <h2 className="text-2xl font-display font-semibold tracking-tight">Explore by topic</h2>
          <p className="mt-1 text-sm text-slate-500">Ten focused clusters. Each post grounded in primary sources.</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {counts.map((c) => (
            <Link
              key={c.slug}
              href={`/${c.slug}`}
              className="block rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:border-brand-500 hover:bg-brand-50 dark:hover:bg-brand-900/20 group"
            >
              <div className="font-medium text-sm group-hover:text-brand-700 dark:group-hover:text-brand-300">
                {c.label}
              </div>
              <div className="text-xs text-slate-500 mt-1">
                {c.count} {c.count === 1 ? "post" : "posts"}
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white p-8 md:p-12">
        <div className="max-w-2xl space-y-4">
          <h2 className="text-2xl md:text-3xl font-display font-semibold tracking-tight">Ask anything about the Prophet ﷺ</h2>
          <p className="text-white/85">
            The chatbot answers only from authentic sources — Quran, Bukhari, Muslim, the four Sunan, and the articles
            on this site. Five questions a day, free. Unlimited with any donation.
          </p>
          <p className="text-sm text-white/70">Look for the green button in the bottom-right of any page.</p>
        </div>
      </section>
    </div>
  );
}
