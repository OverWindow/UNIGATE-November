"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth-content";
import { landingContent, type Language } from "@/lib/landing-content";

const languages: { code: Language; label: string; name: string }[] = [
  { code: "ko", label: "한국어", name: "한국어" },
  { code: "en", label: "EN", name: "English" },
  { code: "id", label: "ID", name: "Bahasa Indonesia" },
];

export function Logo({ className = "" }: { className?: string }) {
  return <Image className={`topiq-logo ${className}`} src="/brand/topiq-logo.png" alt="TOPIQ" width={1945} height={808} sizes="112px" />;
}

export default function SiteHeader({ authHref }: { authHref?: string }) {
  const { language, setLanguage, user, status, refreshSession, logout } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const [notice, setNotice] = useState<{ index: number; sequence: number } | null>(null);
  const noticeSequence = useRef(0);
  const menuButton = useRef<HTMLButtonElement>(null);
  const t = landingContent[language];
  const a = authContent[language];
  const isAuthPage = ["/login", "/signup", "/verify-email"].includes(pathname);
  const loginHref = authHref || (isAuthPage
    ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 4500);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(false);
    try { await logout(); } catch { setLogoutError(true); }
    finally { setLoggingOut(false); }
  }

  const navigation = t.navigation.map((label, index) => {
    const href = index === 0 ? "/" : index === 1 ? "/pbt" : index === 2 ? "/ibt" : undefined;
    return href ? (
      <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} onClick={() => setMenuOpen(false)}>{label}</Link>
    ) : (
      <div className="pending-nav-item" key={label}>
        <button className="pending-nav-button" type="button" onClick={() => setNotice({ index, sequence: ++noticeSequence.current })}>
          <span>{label}</span><span className="coming-soon-badge">{t.comingSoon.badge}</span>
        </button>
        {notice?.index === index && (
          <p className="coming-soon-notice" role="status" key={notice.sequence}>{t.comingSoon.message}</p>
        )}
      </div>
    );
  });

  return (
    <>
      <a className="skip-link" href="#main-content" onClick={(event) => {
        if (pathname !== "/verify-email") return;
        const main = document.getElementById("main-content");
        if (main) { event.preventDefault(); main.focus(); main.scrollIntoView(); }
      }}>{t.accessibility.skip}</a>
      <header className="site-header" onKeyDown={(event) => {
        if (event.key === "Escape") setNotice(null);
        if (event.key === "Escape" && menuOpen) {
          setMenuOpen(false);
          menuButton.current?.focus();
        }
      }}>
        <div className="page-container header-inner">
          <Link className="brand-link" href="/#intro" aria-label={t.accessibility.home} onClick={() => setMenuOpen(false)}>
            <Logo /><span className="brand-tag">TOPIK II</span>
          </Link>
          <nav className="desktop-navigation" aria-label={t.accessibility.navigation}>{navigation}</nav>
          <div className="header-actions">
            <div className="language-switcher" role="group" aria-label={t.accessibility.language}>
              {languages.map(({ code, label, name }) => (
                <button key={code} type="button" lang={code} aria-label={name} aria-pressed={language === code} onClick={() => setLanguage(code)}>{label}</button>
              ))}
            </div>
            {status === "authenticated" && user ? (
              <div className="account-actions">
                <span className="account-name" title={user.nickname}>{user.nickname}</span>
                <button className="header-login" type="button" disabled={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? a.submitting : a.logout}</button>
              </div>
            ) : status === "error" ? (
              <button className="header-login" type="button" aria-label={`${a.retry}: ${a.network}`} onClick={() => void refreshSession()}>{a.retry}</button>
            ) : status === "loading" ? (
              <button className="header-login" type="button" disabled aria-busy="true">{a.login}</button>
            ) : (
              <Link className="header-login" href={loginHref} onNavigate={(event) => {
                if (authHref || isAuthPage) return;
                event.preventDefault();
                const current = window.location.pathname + window.location.search + window.location.hash;
                router.push(`/login?next=${encodeURIComponent(current)}`);
              }}>{a.login}</Link>
            )}
            <button className="menu-toggle" type="button" ref={menuButton} aria-label={menuOpen ? t.accessibility.closeMenu : t.accessibility.openMenu} aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen); setNotice(null); }}>
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>
        <nav className="mobile-navigation" id="mobile-navigation" aria-label={t.accessibility.navigation} hidden={!menuOpen}>{navigation}</nav>
        {logoutError && <p className="header-auth-notice" role="alert">{a.network}</p>}
      </header>
    </>
  );
}
