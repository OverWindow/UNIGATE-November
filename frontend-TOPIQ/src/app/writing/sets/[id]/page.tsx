import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import WritingStudy from "@/components/writing/WritingStudy";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return seoMetadata(`/writing/sets/${encodeURIComponent(id)}`, seoCopy.writingSet);
}

export default async function WritingSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WritingStudy key={id} id={id} />;
}
