import type { Metadata } from "next";
import VocabularyStudy from "@/components/vocabulary/VocabularyStudy";

export const metadata: Metadata = { title: "TOPIQ | 단어와 예문" };

export default async function VocabularySetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VocabularyStudy key={id} id={id} />;
}
