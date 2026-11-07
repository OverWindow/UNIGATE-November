"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth-content";
import { landingContent, type Language } from "@/lib/landing-content";

const languages: { code: Language; name: string }[] = [
  { code: "ko", name: "한국어" },
  { code: "en", name: "English" },
  { code: "id", name: "Bahasa Indonesia" },
];

export function Logo({ className = "" }: { className?: string }) {
  return <Image className={`topiq-logo ${className}`} src="/brand/topiq-logo.png" alt="TOPIQ" width={1945} height={808} sizes="112px" />;
}

export default function SiteHeader({ authHref }: { authHref?: string }) {
  const { language, setLanguage, user, status, refreshSession, logout } = useApp();
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const languagePicker = useRef<HTMLDivElement>(null);
  const languageButton = useRef<HTMLButtonElement>(null);
  const accountPicker = useRef<HTMLDivElement>(null);
  const accountButton = useRef<HTMLButtonElement>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const t = landingContent[language];
  const a = authContent[language];
  const isAuthPage = ["/login", "/signup", "/verify-email"].includes(pathname);
  const loginHref = authHref || (isAuthPage
    ? "/login" : `/login?next=${encodeURIComponent(pathname)}`);

  useEffect(() => {
    if (!languageOpen && !accountOpen) return;
    function closeOutside(event: PointerEvent) {
      if (!(event.target instanceof Node)) return;
      if (!languagePicker.current?.contains(event.target)) setLanguageOpen(false);
      if (!accountPicker.current?.contains(event.target)) setAccountOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [languageOpen, accountOpen]);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    setLogoutError(false);
    try { await logout(); setAccountOpen(false); } catch { setLogoutError(true); }
    finally { setLoggingOut(false); }
  }

  const navigation = t.navigation.map((label, index) => {
    const href = index === 0 ? "/" : index === 1 ? "/pbt" : index === 2 ? "/ibt" : index === 3 ? "/vocabulary" : undefined;
    return href ? (
      <Link key={href} href={href} aria-current={pathname === href || (href === "/vocabulary" && pathname.startsWith("/vocabulary/")) ? "page" : undefined} onClick={() => setMenuOpen(false)}>{label}</Link>
    ) : (
      <button className="pending-nav-button" type="button" key={label} disabled>{label}</button>
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
            <div className="language-picker" ref={languagePicker} onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setLanguageOpen(false);
            }} onKeyDown={(event) => {
              if (event.key === "Escape" && languageOpen) {
                event.stopPropagation();
                setLanguageOpen(false);
                languageButton.current?.focus();
              }
            }}>
              <button className="language-trigger" type="button" ref={languageButton} aria-label={`${t.accessibility.language}: ${languages.find(item => item.code === language)?.name}`} title={t.accessibility.language} aria-expanded={languageOpen} aria-controls="language-options" onClick={() => { setLanguageOpen(!languageOpen); setMenuOpen(false); setAccountOpen(false); }}>
                <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z" /></svg>
              </button>
              <div className="language-options" id="language-options" role="group" aria-label={t.accessibility.language} hidden={!languageOpen}>
                {languages.map(({ code, name }) => <button key={code} type="button" lang={code} aria-pressed={language === code} onClick={() => { setLanguage(code); setLanguageOpen(false); languageButton.current?.focus(); }}>
                  <span>{name}</span><span className="language-check" aria-hidden="true">{language === code ? "✓" : ""}</span>
                </button>)}
              </div>
            </div>
            {status === "authenticated" && user ? (
              <div className="account-actions" ref={accountPicker} onBlur={event => {
                // Disabling the logout button can blur it without moving focus elsewhere.
                if (loggingOut && event.relatedTarget === null) return;
                if (!event.currentTarget.contains(event.relatedTarget)) setAccountOpen(false);
              }} onKeyDown={event => {
                if (event.key === "Escape" && accountOpen) {
                  event.stopPropagation();
                  setAccountOpen(false);
                  accountButton.current?.focus();
                }
              }}>
                <button className="account-name" type="button" ref={accountButton} id="account-trigger" title={user.nickname}
                  aria-expanded={accountOpen} aria-controls="account-menu" onClick={() => {
                    setAccountOpen(!accountOpen); setLanguageOpen(false); setMenuOpen(false);
                  }}>{user.nickname}</button>
                <div className="account-menu" id="account-menu" role="group" aria-labelledby="account-trigger" hidden={!accountOpen}>
                  <button type="button" disabled={loggingOut} aria-busy={loggingOut} onClick={() => void handleLogout()}>{loggingOut ? a.submitting : a.logout}</button>
                  {logoutError && <p className="account-menu-error" role="alert">{a.network}</p>}
                </div>
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
            <button className="menu-toggle" type="button" ref={menuButton} aria-label={menuOpen ? t.accessibility.closeMenu : t.accessibility.openMenu} aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={() => { setMenuOpen(!menuOpen); setLanguageOpen(false); setAccountOpen(false); }}>
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>
        <nav className="mobile-navigation" id="mobile-navigation" aria-label={t.accessibility.navigation} hidden={!menuOpen}>{navigation}</nav>
      </header>
    </>
  );
}
