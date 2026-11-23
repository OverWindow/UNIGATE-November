"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { paymentHistoryContent } from "@/lib/credits-content";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import PaymentHistory from "./PaymentHistory";

export default function RefundSettings() {
  const { language, user, status, refreshSession } = useApp();
  const p = paymentHistoryContent[language];
  const a = authContent[language];
  const loginHref = `${localizedPath("/login", language)}?next=${encodeURIComponent(localizedPath("/settings/refunds", language))}`;

  return <>
    <Link className="text-link mb-4" href={localizedPath("/settings", language)}>
      <ArrowLeft size={16} aria-hidden="true" />{landingContent[language].footer.settings}
    </Link>
    <h1 className="section-heading">{p.refundTitle}</h1>
    <div className="my-8 rounded-xl border border-slate-200 bg-slate-50 p-5 sm:p-6">
      <p className="max-w-prose leading-relaxed text-muted">{p.policy}</p>
      <Link className="text-link mt-1" href={localizedPath("/terms", language)}>{a.terms}</Link>
    </div>
    {status === "loading" ? <p role="status">{a.loading}</p>
      : status === "error" ? <div className="catalog-status" role="alert">
        <p>{a.network}</p>
        <button className="button credits-secondary" type="button" onClick={() => void refreshSession()}>{a.retry}</button>
      </div>
      : status === "authenticated" && user ? <PaymentHistory key={user.id} inSettings />
      : <Link className="button button-primary" href={loginHref}>{p.loginForOrders}</Link>}
  </>;
}
