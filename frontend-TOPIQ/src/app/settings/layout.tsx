import type { Metadata } from "next";
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import "../open-source-licenses/licenses.css";
import "./settings.css";

export const metadata: Metadata = {
  title: "설정 | TOPIQ",
  description: "TOPIQ의 개인정보 처리방침과 서비스 이용약관을 확인할 수 있습니다.",
};

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="settings-shell">
      <SiteHeader />
      <main id="main-content" className="licenses-main page-container" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
