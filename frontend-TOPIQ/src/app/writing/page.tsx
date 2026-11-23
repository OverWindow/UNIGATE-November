import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import WritingCatalog from "@/components/writing/WritingCatalog";

export const generateMetadata = () => seoMetadata("/writing", seoCopy.writing);

export default function WritingPage() {
  return <WritingCatalog />;
}
