import { ClusterIndex } from "@/components/cluster-index";

export const metadata = {
  title: "Hadith — Authentic Narrations of the Prophet ﷺ, Cited",
  description:
    "Themed hadith collections with full chain references to Sahih al-Bukhari, Muslim, and the four Sunan.",
};

export default function Page() {
  return <ClusterIndex cluster="hadith" />;
}
