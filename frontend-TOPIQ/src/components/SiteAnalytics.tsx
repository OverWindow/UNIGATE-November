"use client";

import { usePathname } from "next/navigation";
import Script from "next/script";
import { GA_MEASUREMENT_ID } from "@/lib/analytics";
import { isPasswordConfirmPath } from "@/lib/locale-path";

export default function SiteAnalytics() {
  const pathname = usePathname();
  if (!pathname || isPasswordConfirmPath(pathname)) return null;
  return <>
    <Script src={`https://www.googletagmanager.com/gtm.js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
    <Script id="google-analytics-init" strategy="afterInteractive">
      {`
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
      `}
    </Script>
  </>;
}
