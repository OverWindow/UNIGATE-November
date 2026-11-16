import type { Metadata } from "next";
import WritingCatalog from "@/components/writing/WritingCatalog";

export const metadata: Metadata = {
  title: "TOPIQ | AI 쓰기 튜터",
  description: "TOPIK II PBT 쓰기 51~54번 문제를 세트별로 살펴보세요.",
};

export default function WritingPage() {
  return <WritingCatalog />;
}
