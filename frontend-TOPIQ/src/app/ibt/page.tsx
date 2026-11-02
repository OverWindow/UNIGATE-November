import type { Metadata } from "next";
import ExamPage from "@/components/ExamPage";
import { examContent } from "@/lib/exam-content";

export const metadata: Metadata = {
  title: "TOPIQ | TOPIK II IBT",
  description: examContent.ko.formats.ibt.description,
};

export default function IbtPage() {
  return <ExamPage format="ibt" />;
}
