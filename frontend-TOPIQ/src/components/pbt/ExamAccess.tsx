"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, type ReactNode } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import type { ExamFormat } from "@/lib/exam/exam-content";
import { examCopy } from "@/lib/exam/pbt-content";
import SiteHeader from "../SiteHeader";
import SiteFooter from "../SiteFooter";

export default function ExamAccess({ examFormat, children }: { examFormat: ExamFormat; children: ReactNode }) {
  const { status, user, language, refreshSession } = useApp();
  const path = usePathname();
  const t = examCopy(language, examFormat);
  const auth = authContent[language];
  useEffect(() => {
    if (status !== "anonymous" || !/\/result\/?$/.test(path)) return;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (token?.length === 43) {
      // Keep legacy result credentials out of the login redirect URL.
      try { sessionStorage.setItem(`exam-result:${path.replace(/\/$/, "")}`, token); } catch { /* The original email link remains usable. */ }
    }
  }, [status, path]);
  if (status === "authenticated" || (status === "anonymous" && path.replace(/\/$/, "") === `/${examFormat}`)) {
    return <Fragment key={user?.id ?? "guest"}>{children}</Fragment>;
  }
  return <><SiteHeader /><main id="main-content" className="pbt-main" tabIndex={-1}>
    <section className="catalog-hero"><div className="page-container"><h1 className="catalog-title">{t.title}</h1></div></section>
    <div className="page-container pbt-catalog"><div className="catalog-status">
      {status === "loading" ? <p role="status">{auth.loading}</p> : status === "error"
        ? <><p role="alert">{auth.network}</p><button className="button pbt-secondary" onClick={() => void refreshSession()}>{auth.retry}</button></>
        : <><p>{t.loginRequired}</p><Link className="button button-primary" href={`/login?next=${encodeURIComponent(path)}`}>{auth.login}</Link></>}
    </div></div>
  </main><SiteFooter /></>;
}
