import Link from "next/link";
import { getTopicsByCluster, getPostSlugsByCluster } from "@/lib/posts";

export const runtime = "edge";

export const metadata = {
  title: "99 Names of Allah — Asma ul-Husna with Meaning",
  description:
    "The 99 beautiful names of Allah (Asma ul-Husna). Each card links to a full article on its meaning, occurrences in the Quran, and how to internalize it.",
};

function parseName(title: string): { name: string; meaning: string; index: number } {
  const [head, tail] = title.split(" — Name ");
  const [name, meaning] = head.split(": ").map((s) => s.trim());
  const index = tail ? Number(tail.split(" ")[0]) : 0;
  return { name, meaning: meaning ?? "", index };
}

export default async function Page() {
  const [topics, publishedSlugs] = await Promise.all([
    getTopicsByCluster("names-of-allah"),
    getPostSlugsByCluster("names-of-allah"),
  ]);
  const publishedSet = new Set(publishedSlugs);

  const rows = topics
    .map((t) => ({ ...t, ...parseName(t.title) }))
    .sort((a, b) => a.index - b.index);

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-brand-500 font-medium">Asma ul-Husna</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tightest">The 99 Names of Allah</h1>
        <p className="max-w-2xl text-slate-600 dark:text-slate-300">
          The most beautiful names, mentioned in Quran 7:180. Tap any published name to read a full article — one new
          name every day. Coming-soon names are dimmed.
        </p>
      </header>

      <ul className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rows.map((r) => {
          const isPublished = publishedSet.has(r.slug);
          const inner = (
            <div className="relative rounded-lg bg-brand-50 dark:bg-brand-900/25 border border-brand-100 dark:border-brand-800 p-3 h-full transition group-hover:border-brand-500">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-mono text-brand-700 dark:text-brand-300">
                  {String(r.index).padStart(2, "0")}
                </span>
                {!isPublished && <span className="text-[9px] uppercase tracking-wider text-slate-400">Soon</span>}
              </div>
              <div className="mt-1 text-black dark:text-slate-100 font-semibold text-[15px] leading-tight">{r.name}</div>
              <div className="mt-0.5 text-[11px] leading-snug text-slate-700 dark:text-slate-300 line-clamp-2">
                {r.meaning}
              </div>
            </div>
          );
          return (
            <li key={r.slug}>
              {isPublished ? (
                <Link href={`/names-of-allah/${r.slug}`} className="block group h-full">
                  {inner}
                </Link>
              ) : (
                <div className="group h-full cursor-not-allowed opacity-60" aria-disabled>
                  {inner}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-slate-500">
        {publishedSet.size} of {rows.length} names published.
      </p>
    </div>
  );
}
