import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import PbtCatalog from "@/components/pbt/PbtCatalog";

export const generateMetadata = () => seoMetadata("/ibt", seoCopy.ibt);

export default function IbtPage() {
  return <PbtCatalog examFormat="ibt" />;
}
