import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { contactContent } from "@/lib/contact-content";
import { paymentHistoryContent } from "@/lib/credits-content";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { plansContent } from "@/lib/plans-content";
import { requestLanguage } from "@/lib/seo";

export async function generateMetadata() {
  const language = await requestLanguage();
  return { title: `${landingContent[language].footer.settings} | TOPIQ` };
}

export default async function SettingsPage() {
  const language = await requestLanguage();
  const links = [
    { path: "/settings/subscription", label: plansContent[language].settingsTitle },
    { path: "/settings/refunds", label: paymentHistoryContent[language].refundTitle },
    { path: "/settings/contact", label: contactContent[language].title },
  ];
  return (
    <>
      <h1 id="settings-title" className="section-heading">{landingContent[language].footer.settings}</h1>
      <nav aria-labelledby="settings-title" className="mt-8">
        <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
          {links.map(({ path, label }) => (
            <li key={path}>
              <Link href={localizedPath(path, language)}
                className="flex items-center justify-between gap-4 rounded-xl px-5 py-4 font-medium hover:bg-slate-50 hover:text-primary">
                {label}
                <ChevronRight size={18} className="shrink-0 text-muted" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
