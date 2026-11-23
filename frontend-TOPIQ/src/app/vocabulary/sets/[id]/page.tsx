import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import VocabularyStudy from "@/components/vocabulary/VocabularyStudy";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return seoMetadata(`/vocabulary/sets/${encodeURIComponent(id)}`, seoCopy.vocabularySet);
}

export default async function VocabularySetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VocabularyStudy key={id} id={id} />;
}
