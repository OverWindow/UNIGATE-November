import type { Metadata } from "next";
import { Suspense } from "react";
import VocabularyCatalog, { VocabularyLoading } from "@/components/vocabulary/VocabularyCatalog";

export const metadata: Metadata = {
  title: "TOPIQ | 급수별 단어장",
  description: "TOPIK 3~6급 단어를 약 20개씩 나누어 뜻과 예문으로 살펴보세요.",
};

export default function VocabularyPage() {
  return <Suspense fallback={<VocabularyLoading />}><VocabularyCatalog /></Suspense>;
}
