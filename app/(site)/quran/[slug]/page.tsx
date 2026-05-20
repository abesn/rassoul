import { notFound } from "next/navigation";
import { PostRenderer } from "@/components/post-renderer";
import { getPost, getPostsByCluster } from "@/lib/posts";

export function generateStaticParams() {
  return getPostsByCluster("quran").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost("quran", slug);
  if (!post) return {};
  return { title: post.title, description: post.description };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost("quran", slug);
  if (!post) return notFound();
  return <PostRenderer post={post} />;
}
