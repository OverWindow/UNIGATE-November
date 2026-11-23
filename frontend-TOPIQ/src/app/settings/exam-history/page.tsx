import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { pbtContent } from "@/lib/exam/pbt-content";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { requestLanguage } from "@/lib/seo";
import ExamHistory from "./ExamHistory";

export async function generateMetadata() {
  const language = await requestLanguage();
  return { title: `${pbtContent[language].history} | TOPIQ` };
}

export default async function ExamHistoryPage() {
  const language = await requestLanguage();
  return <>
    <Link className="text-link mb-4" href={localizedPath("/settings", language)}>
      <ArrowLeft size={16} aria-hidden="true" />{landingContent[language].footer.settings}
    </Link>
    <h1 className="section-heading">{pbtContent[language].history}</h1>
    <div className="mt-8"><ExamHistory /></div>
  </>;
}
