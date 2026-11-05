import type { Metadata } from "next";
import PbtCatalog from "@/components/pbt/PbtCatalog";
import { examContent } from "@/lib/exam-content";

export const metadata: Metadata = {
  title: "TOPIQ | TOPIK II IBT 모의고사",
  description: examContent.ko.formats.ibt.description,
};

export default function IbtPage() {
  return <PbtCatalog examFormat="ibt" />;
}
