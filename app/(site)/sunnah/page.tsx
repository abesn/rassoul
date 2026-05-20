import { ClusterIndex } from "@/components/cluster-index";

export const metadata = {
  title: "The Sunnah — Practical Habits of the Prophet ﷺ",
  description: "Daily-life practices of the Messenger ﷺ — eating, sleeping, dress, manners — with citations.",
};

export default function Page() {
  return <ClusterIndex cluster="sunnah" />;
}
