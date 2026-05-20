import { ClusterIndex } from "@/components/cluster-index";

export const metadata = {
  title: "Ramadan — Fasting, Taraweeh, and the Blessed Month",
  description: "Everything for Ramadan: fasting rules, taraweeh, Laylat al-Qadr, iftar duas, and more.",
};

export default function Page() {
  return <ClusterIndex cluster="ramadan" />;
}
