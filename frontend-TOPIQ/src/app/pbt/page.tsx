import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import PbtCatalog from "@/components/pbt/PbtCatalog";

export const generateMetadata = () => seoMetadata("/pbt", seoCopy.pbt);

export default function PbtPage() {
  return <PbtCatalog />;
}
