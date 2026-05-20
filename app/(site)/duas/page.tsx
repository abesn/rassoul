import { ClusterIndex } from "@/components/cluster-index";

export const metadata = {
  title: "Duas — Authentic Supplications with Arabic & English",
  description:
    "A growing library of duas (supplications) with full Arabic, transliteration, English meaning, and citation to the primary hadith source.",
};

export default function Page() {
  return <ClusterIndex cluster="duas" />;
}
