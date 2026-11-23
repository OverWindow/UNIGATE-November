import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { plansContent } from "@/lib/plans-content";
import { requestLanguage } from "@/lib/seo";
import SubscriptionSettings from "./SubscriptionSettings";

export async function generateMetadata() {
  const language = await requestLanguage();
  return { title: `${plansContent[language].settingsTitle} | TOPIQ` };
}

export default async function SubscriptionPage() {
  const language = await requestLanguage();
  return <>
    <Link className="text-link mb-4" href={localizedPath("/settings", language)}>
      <ArrowLeft size={16} aria-hidden="true" />{landingContent[language].footer.settings}
    </Link>
    <h1 className="section-heading">{plansContent[language].settingsTitle}</h1>
    <div className="mt-8"><SubscriptionSettings /></div>
  </>;
}
