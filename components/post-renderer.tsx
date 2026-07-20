import type { Post } from "@/lib/posts";

/**
 * Renders a post whose `html` field is already compiled MDX-to-HTML from n8n.
 * We inject it directly via dangerouslySetInnerHTML — no MDX runtime at the edge.
 */
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
        {post.description && <p className="mt-3 text-slate-500 text-lg">{post.description}</p>}
        {post.publishedAt && (
          <time className="mt-4 block text-xs text-slate-500 uppercase tracking-wider" dateTime={post.publishedAt}>
            Published {new Date(post.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </time>
        )}
      </header>
      <div dangerouslySetInnerHTML={{ __html: post.html }} />
    </article>
  );
}
