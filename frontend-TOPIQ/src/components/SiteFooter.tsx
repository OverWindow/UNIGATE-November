"use client";

import Link from "next/link";
import { useApp } from "@/app/providers";
import { landingContent } from "@/lib/landing-content";
import { Logo } from "./SiteHeader";

export default function SiteFooter() {
  const { language } = useApp();
  const t = landingContent[language];

  return (
    <footer className="site-footer">
      <div className="page-container">
        <div className="footer-main">
          <Link href="/#intro" aria-label={t.accessibility.home}><Logo /></Link>
          <div className="footer-links">
            <a href="https://www.unigate.kr/" target="_blank" rel="noopener noreferrer">
              {t.footer.parent}
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 18 18 6M6 6h12v12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <a href="#main-content">{t.footer.top}<span aria-hidden="true">↑</span></a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 UNIGATE. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
