import type { Metadata } from "next";
import WritingStudy from "@/components/writing/WritingStudy";

export const metadata: Metadata = { title: "TOPIQ | PBT 쓰기 문제" };

export default async function WritingSetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <WritingStudy key={id} id={id} />;
}
