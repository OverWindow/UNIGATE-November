import type { Metadata } from "next";
import WritingHistory from "@/components/writing/WritingHistory";

export const metadata: Metadata = { title: "내 쓰기 평가 | TOPIQ" };

export default function HistoryPage() {
  return <WritingHistory />;
}
