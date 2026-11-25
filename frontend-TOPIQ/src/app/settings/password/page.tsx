import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PasswordRequestForm from "@/components/auth/PasswordRequestForm";
import { passwordContent } from "@/lib/auth/password-content";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { requestLanguage } from "@/lib/seo";

export async function generateMetadata() {
  const language = await requestLanguage();
  return { title: `${passwordContent[language].change} | TOPIQ`, robots: { index: false, follow: false } };
}

export default async function PasswordSettingsPage() {
  const language = await requestLanguage();
  return <>
    <Link className="text-link mb-4" href={localizedPath("/settings", language)}>
      <ArrowLeft size={16} aria-hidden="true" /> {landingContent[language].footer.settings}
    </Link>
    <h1 className="section-heading">{passwordContent[language].change}</h1>
    <div className="mt-6 max-w-md"><PasswordRequestForm purpose="change" /></div>
  </>;
}
