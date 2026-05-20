import { notFound } from "next/navigation";
import { PostRenderer } from "@/components/post-renderer";
import { getPost, getPostsByCluster } from "@/lib/posts";

export function generateStaticParams() {
  return getPostsByCluster("names-of-the-messenger").map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost("names-of-the-messenger", slug);
  if (!post) return {};
  return { title: post.title, description: post.description };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = getPost("names-of-the-messenger", slug);
  if (!post) return notFound();
  return <PostRenderer post={post} />;
}
