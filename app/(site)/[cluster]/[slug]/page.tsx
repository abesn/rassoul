import { notFound } from "next/navigation";
import { getPost, CLUSTERS, type ClusterSlug } from "@/lib/posts";
import { PostRenderer } from "@/components/post-renderer";

export const runtime = "edge";

function isValidCluster(c: string): c is ClusterSlug {
  return (CLUSTERS as readonly { slug: string }[]).some((cl) => cl.slug === c);
}

export async function generateMetadata({ params }: { params: Promise<{ cluster: string; slug: string }> }) {
  const { cluster, slug } = await params;
  if (!isValidCluster(cluster)) return {};
  const post = await getPost(cluster, slug);
  if (!post) return {};
  return { title: post.title, description: post.description };
}

export default async function PostPage({ params }: { params: Promise<{ cluster: string; slug: string }> }) {
  const { cluster, slug } = await params;
  if (!isValidCluster(cluster)) return notFound();
  const post = await getPost(cluster, slug);
  if (!post) return notFound();
  return <PostRenderer post={post} />;
}
