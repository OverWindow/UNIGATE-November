import type { Metadata } from "next";
import ExamPage from "@/components/ExamPage";
import { examContent } from "@/lib/exam-content";

export const metadata: Metadata = {
  title: "TOPIQ | TOPIK II PBT",
  description: examContent.ko.formats.pbt.description,
};

export default function PbtPage() {
  return <ExamPage format="pbt" />;
}
