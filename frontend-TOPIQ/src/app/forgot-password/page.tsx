import Link from "next/link";
import PasswordRequestForm from "@/components/auth/PasswordRequestForm";
import SiteHeader from "@/components/SiteHeader";
import { authContent } from "@/lib/auth/auth-content";
import { passwordContent } from "@/lib/auth/password-content";
import { localizedPath } from "@/lib/locale-path";
import { requestLanguage } from "@/lib/seo";

export async function generateMetadata() {
  const language = await requestLanguage();
  return { title: `${passwordContent[language].reset} | TOPIQ`, robots: { index: false, follow: false } };
}

export default async function ForgotPasswordPage() {
  const language = await requestLanguage();
  return <>
    <SiteHeader />
    <main className="auth-main" id="main-content" tabIndex={-1}>
      <div className="auth-card">
        <h1>{passwordContent[language].reset}</h1>
        <PasswordRequestForm purpose="reset" />
        <p className="auth-switch"><Link href={localizedPath("/login", language)}>{authContent[language].login}</Link></p>
      </div>
    </main>
  </>;
}
