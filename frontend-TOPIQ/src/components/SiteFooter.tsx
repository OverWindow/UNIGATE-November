"use client";

import Link from "next/link";
import { ArrowUp, ExternalLink } from "lucide-react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { billingEmail } from "@/lib/credits-content";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { Logo } from "./SiteHeader";

export default function SiteFooter() {
  const { language } = useApp();
  const t = landingContent[language];
  const { privacy, terms } = authContent[language];

  return (
    <footer className="site-footer">
      <div className="page-container">
        <div className="footer-main">
          <Link href={`${localizedPath("/", language)}#intro`} aria-label={t.accessibility.home}><Logo loading="eager" /></Link>
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
          <ul className="footer-document-links">
            <li><Link href={localizedPath("/privacy", language)}>{privacy}</Link></li>
            <li><Link href={localizedPath("/terms", language)}>{terms}</Link></li>
            <li><Link href={localizedPath("/open-source-licenses", language)}>{t.footer.licenses}</Link></li>
            <li><a href={`mailto:${billingEmail}`}>{t.footer.billing}: {billingEmail}</a></li>
          </ul>
        </div>
        <p className="footer-trademark">{t.footer.trademark}</p>
      </div>
    </footer>
  );
}
