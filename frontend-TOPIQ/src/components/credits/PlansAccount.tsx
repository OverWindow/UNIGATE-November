"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { creditsContent } from "@/lib/credits-content";
import { planAmount, plansContent } from "@/lib/plans-content";
import { localizedPath } from "@/lib/locale-path";
import { getPlans, WritingError, type PlanAccount, type ScheduledPlanChange } from "@/lib/writing/writing-api";
import CreditPurchase from "./CreditPurchase";
import { usePlanRefresh } from "./PlanChangeControls";
import PlanOffers from "./PlanOffers";

export default function PlansAccount() {
  const { user, status, language, refreshSession } = useApp();
  const a = authContent[language];
  const p = plansContent[language];
  const search = useSearchParams();
  const purchase = search.get("purchase");
  const returnId = purchase && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(purchase) ? purchase : null;
  const cancelled = search.get("cancelled") === "1";
  const next = returnId ? `/plans?purchase=${returnId}${cancelled ? "&cancelled=1" : ""}` : "/plans";
  return <div className="page-container credits-page">
    <header>
      <h1 className="catalog-title">{a.plusPlans}</h1>
      <p className="catalog-description">{p.intro}</p>
    </header>
    {status === "loading" ? <p className="catalog-status" role="status">{a.loading}</p>
      : status === "error" ? <div className="catalog-status" role="alert">{a.network} <button className="button credits-secondary" onClick={() => void refreshSession()}>{a.retry}</button></div>
      : !user ? <div className="credits-purchase">
        <PlanOffers language={language} renderAction={({ months, amount }) => {
          const label = months === 1 ? p.trial.start : p.trial.pay(planAmount(language, amount));
          return <Link className="button button-primary" href={`${localizedPath("/login", language)}?next=${encodeURIComponent(localizedPath(next, language))}`}
            aria-label={`${label} · ${p.login}`}>{label}</Link>;
        }} />
      </div>
      : <MemberPlans key={user.id} userId={user.id} returnId={returnId} cancelled={cancelled} />}
    <div className="billing-notice" id="plan-card-notice"><Info size={16} aria-hidden="true" /><p>{creditsContent[language].cardIssuerNotice}</p></div>
  </div>;
}

function MemberPlans({ userId, returnId, cancelled }: { userId: number; returnId: string | null; cancelled: boolean }) {
  const { language, refreshSession, refreshCredits, updatePlan } = useApp();
  const a = authContent[language];
  const [data, setData] = useState<PlanAccount | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  usePlanRefresh(data, reload);
  function refreshPlan(change?: ScheduledPlanChange | null) {
    if (change !== undefined) setData(current => current && { ...current, scheduledChange: change });
    reload();
  }
  const onFulfilled = useCallback((signal: AbortSignal) => {
    reload();
    void refreshCredits(signal).catch(() => {});
  }, [reload, refreshCredits]);

  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    getPlans(controller.signal).then(value => {
      if (!controller.signal.aborted) {
        setData(value);
        updatePlan(userId, value.endsAt);
      }
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setError(true);
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
    });
    return () => controller.abort();
  }, [revision, refreshSession, updatePlan, userId]);

  return <>
    {error ? <div className="catalog-status" role="alert">{a.network} <button className="button credits-secondary" onClick={reload}>{a.retry}</button></div>
      : !data ? <p className="catalog-status" role="status">{a.loading}</p> : null}
    <CreditPurchase userId={userId} returnId={returnId} cancelled={cancelled} planAccount={error ? null : data}
      onFulfilled={onFulfilled} onPlanRefresh={refreshPlan} />
  </>;
}
