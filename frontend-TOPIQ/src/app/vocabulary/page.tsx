import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import { Suspense } from "react";
import VocabularyCatalog, { VocabularyLoading } from "@/components/vocabulary/VocabularyCatalog";

export const generateMetadata = () => seoMetadata("/vocabulary", seoCopy.vocabulary);

export default function VocabularyPage() {
  return <Suspense fallback={<VocabularyLoading />}><VocabularyCatalog /></Suspense>;
}
