"use client";

import Link from "next/link";
import { ArrowUp, ExternalLink } from "lucide-react";
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
              <ExternalLink size={18} strokeWidth={1.7} aria-hidden="true" />
            </a>
            <a href="#main-content">{t.footer.top}<ArrowUp size={14} aria-hidden="true" /></a>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 UNIGATE. All rights reserved.</span>
          <Link href="/open-source-licenses">{t.footer.licenses}</Link>
        </div>
      </div>
    </footer>
  );
}
