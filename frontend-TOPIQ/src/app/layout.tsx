import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import NavigationOverlay from "@/components/NavigationOverlay";
import SiteAnalytics from "@/components/SiteAnalytics";
import Providers from "./providers";
import { requestLanguage } from "@/lib/seo";
import { seoOrigin } from "@/lib/locale-path";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(seoOrigin),
  title: "UNIGATE TOPIQ",
  description: "TOPIK II 읽기부터 쓰기, 단어장까지. TOPIQ이 준비하는 한국어 학습을 만나보세요.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const language = await requestLanguage();
  return (
    <html lang={language} data-scroll-behavior="smooth">
      <body>
        <Providers initialLanguage={language}><Suspense fallback={null}><NavigationOverlay /></Suspense>{children}</Providers>
        <Suspense fallback={null}><SiteAnalytics /></Suspense>
      </body>
    </html>
  );
}
