"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { isPasswordConfirmPath } from "@/lib/locale-path";

export default function SiteAnalytics() {
  const pathname = usePathname();
  if (!pathname || isPasswordConfirmPath(pathname)) return null;
  return <>
    <Script src="https://www.googletagmanager.com/gtm.js?id=G-MNFFKP03XD" strategy="afterInteractive" />
    <Script id="google-analytics-init" strategy="afterInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
      `}
    </Script>
  </>;
}
