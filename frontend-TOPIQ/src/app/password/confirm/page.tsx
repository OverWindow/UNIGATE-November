import PasswordConfirmForm from "@/components/auth/PasswordConfirmForm";
import SiteHeader from "@/components/SiteHeader";
import { passwordContent } from "@/lib/auth/password-content";
import { requestLanguage } from "@/lib/seo";

export async function generateMetadata() {
  const language = await requestLanguage();
  return {
    title: `${passwordContent[language].newPassword} | TOPIQ`,
    robots: { index: false, follow: false },
    referrer: "no-referrer" as const,
  };
}

export default function ConfirmPasswordPage() {
  return <>
    <SiteHeader />
    <main className="auth-main" id="main-content" tabIndex={-1}>
      <div className="auth-card"><PasswordConfirmForm /></div>
    </main>
  </>;
}
