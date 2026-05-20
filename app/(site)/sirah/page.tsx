import { ClusterIndex } from "@/components/cluster-index";

export const metadata = {
  title: "Sirah — The Life of the Messenger of Allah ﷺ",
  description:
    "A chronological reference to the sirah of the Prophet Muhammad ﷺ, from the Year of the Elephant through the Farewell Sermon.",
};

export default function Page() {
  return <ClusterIndex cluster="sirah" />;
}
