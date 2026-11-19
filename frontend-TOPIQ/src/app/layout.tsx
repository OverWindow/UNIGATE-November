import type { Metadata } from "next";
import Script from "next/script";
import { Suspense, type ReactNode } from "react";
import NavigationOverlay from "@/components/NavigationOverlay";
import Providers from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "UNIGATE TOPIQ",
  description: "TOPIK II 읽기부터 쓰기, 단어장까지. TOPIQ이 준비하는 한국어 학습을 만나보세요.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>
        <Providers><Suspense fallback={null}><NavigationOverlay /></Suspense>{children}</Providers>
        <Script
          src="https://www.googletagmanager.com/gtm.js?id=G-MNFFKP03XD"
          strategy="afterInteractive"
        />
        <Script id="google-analytics-init" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
          `}
        </Script>
      </body>
    </html>
  );
}
