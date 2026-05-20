import { MDXRemote } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import type { Post } from "@/lib/posts";

const components = {
  Arabic: ({ children }: { children: React.ReactNode }) => (
    <div className="arabic-block my-6 text-stone-900 dark:text-stone-100">{children}</div>
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
      className="text-xs inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 no-underline"
    >
      {source}
      {book ? ` · ${book}` : ""}
      {number ? ` ${number}` : ""}
    </a>
  ),
};

export function PostRenderer({ post }: { post: Post }) {
  return (
    <article className="prose prose-stone dark:prose-invert">
      <header className="not-prose mb-8">
        <p className="text-xs uppercase tracking-wide text-emerald-600">
          {post.cluster.replace(/-/g, " ")}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{post.title}</h1>
        {post.description && (
          <p className="mt-2 text-stone-500 text-lg">{post.description}</p>
        )}
        {post.publishedAt && (
          <time className="mt-2 block text-xs text-stone-500" dateTime={post.publishedAt}>
            Published {new Date(post.publishedAt).toLocaleDateString("en-US", {
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
