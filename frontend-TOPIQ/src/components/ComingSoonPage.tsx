"use client";

import Link from "next/link";
import { useApp } from "@/app/providers";
import { landingContent } from "@/lib/landing-content";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

export default function ComingSoonPage() {
  const { language } = useApp();
  const t = landingContent[language].comingSoon;

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="coming-soon-main" tabIndex={-1}>
        <section className="coming-soon-card" aria-labelledby="coming-soon-title">
          <div className="coming-soon-orbit" aria-hidden="true"><span /></div>
          <p className="eyebrow">TOPIK II IBT</p>
          <span className="coming-soon-badge">{t.badge}</span>
          <h1 id="coming-soon-title">{t.title}</h1>
          <p className="coming-soon-description">{t.message}</p>
          <Link className="button button-primary" href="/">{t.home}</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
