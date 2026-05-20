import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Post } from "@/lib/posts";

const components = {
  Arabic: ({ children }: { children: React.ReactNode }) => (
    <div className="arabic-block my-6 text-slate-900 dark:text-slate-100">{children}</div>
  ),
  Citation: ({
    source,
    book,
    number,
    href,
  }: {
    source: string;
    book?: string;
    number?: string;
    href: string;
  }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300 no-underline hover:bg-brand-100 dark:hover:bg-brand-900/50"
    >
      {source}
      {book ? ` · ${book}` : ""}
      {number ? ` ${number}` : ""}
    </a>
  ),
};

export function PostRenderer({ post }: { post: Post }) {
  return (
    <article className="prose prose-slate dark:prose-invert prose-headings:font-display prose-headings:tracking-tight">
      <header className="not-prose mb-10 pb-8 border-b border-slate-200 dark:border-slate-800">
        <p className="text-xs uppercase tracking-wider text-brand-500 font-medium">
          {post.cluster.replace(/-/g, " ")}
        </p>
        <h1 className="mt-3 text-3xl md:text-4xl font-display font-semibold tracking-tightest leading-tight">
          {post.title}
        </h1>
        {post.description && (
          <p className="mt-3 text-slate-500 text-lg">{post.description}</p>
        )}
        {post.publishedAt && (
          <time
            className="mt-4 block text-xs text-slate-500 uppercase tracking-wider"
            dateTime={post.publishedAt}
          >
            Published{" "}
            {new Date(post.publishedAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </time>
        )}
      </header>
      <MDXRemote
        source={post.body}
        components={components}
        options={{ mdxOptions: { remarkPlugins: [remarkGfm], rehypePlugins: [rehypeSlug] } }}
      />
    </article>
  );
}
