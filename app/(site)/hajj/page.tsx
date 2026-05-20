import { ClusterIndex } from "@/components/cluster-index";

export const metadata = {
  title: "Hajj & Umrah — Step-by-Step Guides",
  description: "How to perform Hajj and Umrah, day by day, with cited duas and rulings.",
};

export default function Page() {
  return <ClusterIndex cluster="hajj" />;
}
