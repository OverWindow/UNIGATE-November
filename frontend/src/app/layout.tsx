import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "../styles/index.css";

export const viewport: Viewport = { themeColor: "#eee7f5" };
export const metadata: Metadata = { icons: { icon: "/favicon.ico" } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body>
    {children}
    <Script src="https://www.googletagmanager.com/gtag/js?id=G-S2TDPYEQ93" strategy="afterInteractive" />
    <Script id="google-analytics" strategy="afterInteractive">{
      `window.dataLayer = window.dataLayer || [];
       function gtag(){dataLayer.push(arguments);}
       gtag('js', new Date());
       gtag('config', 'G-S2TDPYEQ93');`
    }</Script>
  </body></html>;
}
