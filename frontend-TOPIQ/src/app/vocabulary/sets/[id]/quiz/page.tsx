import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import VocabularyQuiz from "@/components/vocabulary/VocabularyQuiz";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return seoMetadata(`/vocabulary/sets/${encodeURIComponent(id)}/quiz`, seoCopy.vocabularyQuiz);
}

export default async function VocabularyQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VocabularyQuiz key={id} id={id} />;
}
