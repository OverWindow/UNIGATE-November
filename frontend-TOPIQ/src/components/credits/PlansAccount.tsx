"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { plansContent } from "@/lib/plans-content";
import { getPlans, WritingError, type PlanAccount } from "@/lib/writing/writing-api";
import CreditPurchase from "./CreditPurchase";
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
    <h1 className="catalog-title">Plus</h1>
    {status === "loading" ? <p className="catalog-status" role="status">{a.loading}</p>
      : status === "error" ? <div className="catalog-status" role="alert">{a.network} <button className="button credits-secondary" onClick={() => void refreshSession()}>{a.retry}</button></div>
      : !user ? <div className="credits-purchase">
        <PlanOffers language={language} renderAction={({ months }) =>
          <Link className="button button-primary" href={`/login?next=${encodeURIComponent(next)}`}
            aria-label={`${p.term(months)} · ${p.login}`}>{p.login}</Link>
        } />
      </div>
      : <MemberPlans key={user.id} userId={user.id} returnId={returnId} cancelled={cancelled} />}
  </div>;
}

function MemberPlans({ userId, returnId, cancelled }: { userId: number; returnId: string | null; cancelled: boolean }) {
  const { language, refreshSession, refreshCredits, updatePlan } = useApp();
  const a = authContent[language];
  const [data, setData] = useState<PlanAccount | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
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

  useEffect(() => {
    if (!data?.endsAt) return;
    // Browsers accept at most a signed 32-bit timeout for long passes.
    const untilExpiry = new Date(data.endsAt).getTime() - Date.now();
    const timer = setTimeout(reload, Math.max(1000, Math.min(untilExpiry, 2_147_483_647)));
    return () => clearTimeout(timer);
  }, [data, reload]);

  return <>
    {error ? <div className="catalog-status" role="alert">{a.network} <button className="button credits-secondary" onClick={reload}>{a.retry}</button></div>
      : !data ? <p className="catalog-status" role="status">{a.loading}</p> : null}
    <CreditPurchase userId={userId} returnId={returnId} cancelled={cancelled} planAccount={data}
      onFulfilled={onFulfilled} onPriceChanged={reload} />
  </>;
}
