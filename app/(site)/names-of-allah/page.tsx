import fs from "node:fs";
import path from "node:path";
import Link from "next/link";
import { parse } from "csv-parse/sync";
import { getPost } from "@/lib/posts";

export const metadata = {
  title: "99 Names of Allah — Asma ul-Husna with Meaning",
  description:
    "The 99 beautiful names of Allah (Asma ul-Husna). Each card links to a full article on its meaning, occurrences in the Quran, and how to internalize it.",
};

type TopicRow = {
  slug: string;
  title: string;
  cluster: string;
  keyword: string;
  status: string;
  url: string;
};

function loadNameTopics(): TopicRow[] {
  const csvPath = path.join(process.cwd(), "content", "topics.csv");
  if (!fs.existsSync(csvPath)) return [];
  const raw = fs.readFileSync(csvPath, "utf8");
  const rows = parse(raw, { columns: true, skip_empty_lines: true }) as TopicRow[];
  return rows.filter((r) => r.cluster === "names-of-allah");
}

/**
 * Titles in topics.csv look like: "Ar-Rahman: The Most Compassionate — Name 1 of Allah"
 * Split into { name, meaning, index }.
 */
function parseName(title: string): { name: string; meaning: string; index: number } {
  const [head, tail] = title.split(" — Name ");
  const [name, meaning] = head.split(": ").map((s) => s.trim());
  const index = tail ? Number(tail.split(" ")[0]) : 0;
  return { name, meaning: meaning ?? "", index };
}

export default function Page() {
  const rows = loadNameTopics()
    .map((r) => ({ ...r, ...parseName(r.title) }))
    .sort((a, b) => a.index - b.index);

  return (
    <div className="space-y-10">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-wider text-brand-500 font-medium">Asma ul-Husna</p>
        <h1 className="text-3xl md:text-4xl font-display font-semibold tracking-tightest">
          The 99 Names of Allah
        </h1>
        <p className="max-w-2xl text-slate-600 dark:text-slate-300">
          The most beautiful names, mentioned in Quran 7:180. Tap any name to read a full
          article — one is published every day. Names still to come are marked "Coming soon."
        </p>
      </header>

      <ul className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
        {rows.map((r) => {
          const isPublished = r.status === "published" || r.status === "needs_review";
          const post = isPublished ? getPost("names-of-allah", r.slug) : undefined;

          const inner = (
            <div className="relative rounded-lg bg-brand-50 dark:bg-brand-900/25 border border-brand-100 dark:border-brand-800 p-3 h-full transition group-hover:border-brand-500">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[10px] font-mono text-brand-700 dark:text-brand-300">
                  {String(r.index).padStart(2, "0")}
                </span>
                {!isPublished && (
                  <span className="text-[9px] uppercase tracking-wider text-slate-400">Soon</span>
                )}
              </div>
              <div className="mt-1 text-black dark:text-slate-100 font-semibold text-[15px] leading-tight">
                {r.name}
              </div>
              <div className="mt-0.5 text-[11px] leading-snug text-slate-700 dark:text-slate-300 line-clamp-2">
                {r.meaning}
              </div>
            </div>
          );

          return (
            <li key={r.slug}>
              {isPublished && post ? (
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
        {rows.filter((r) => r.status === "published" || r.status === "needs_review").length} of{" "}
        {rows.length} names published.
      </p>
    </div>
  );
}
