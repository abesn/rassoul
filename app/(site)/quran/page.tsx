import { ClusterIndex } from "@/components/cluster-index";

export const metadata = {
  title: "Quran — Surah Guides, Tafsir & Benefits",
  description: "Surah-by-surah guides with meaning, context, and benefits, cited to tafsir sources.",
};

export default function Page() {
  return <ClusterIndex cluster="quran" />;
}
