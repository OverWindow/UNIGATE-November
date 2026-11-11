import type { Metadata } from "next";
import VocabularyQuiz from "@/components/vocabulary/VocabularyQuiz";

export const metadata: Metadata = { title: "TOPIQ | 문장 빈칸 퀴즈" };

export default async function VocabularyQuizPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <VocabularyQuiz key={id} id={id} />;
}
