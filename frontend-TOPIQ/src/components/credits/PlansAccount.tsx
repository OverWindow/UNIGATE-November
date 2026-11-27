"use client";

import { Info, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { creditsContent } from "@/lib/credits-content";
import { plansContent } from "@/lib/plans-content";
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
    {(status !== "authenticated" || !user) && <PlansHeading confirmExit={status === "anonymous"} />}
    {status === "loading" ? <p className="catalog-status" role="status">{a.loading}</p>
      : status === "error" ? <div className="catalog-status" role="alert">{a.network} <button className="button credits-secondary" onClick={() => void refreshSession()}>{a.retry}</button></div>
      : !user ? <div className="credits-purchase">
        <PlanOffers language={language} renderAction={({ months }) => {
          const label = months === 1 ? p.trial.start : p.trial.pay;
          return <Link className={`button ${months === 1 ? "button-primary" : "plan-pay-button"}`} href={`${localizedPath("/login", language)}?next=${encodeURIComponent(localizedPath(next, language))}`}
            aria-label={`${label} · ${p.login}`}>{label}</Link>;
        }} />
      </div>
      : <MemberPlans key={user.id} userId={user.id} returnId={returnId} cancelled={cancelled} />}
    <div className="billing-notice" id="plan-card-notice"><Info size={16} aria-hidden="true" /><p>{creditsContent[language].cardIssuerNotice}</p></div>
  </div>;
}

function PlansHeading({ confirmExit, checkout }: { confirmExit: boolean; checkout?: RefObject<boolean> }) {
  const { language } = useApp();
  const p = plansContent[language];
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const stayButton = useRef<HTMLButtonElement>(null);
  const leaving = useRef(false);
  const showDialog = useCallback(() => {
    dialog.current?.showModal();
    stayButton.current?.focus();
  }, []);

  function leave() {
    leaving.current = true;
    dialog.current?.close();
    const steps = window.history.state?.topiqPlansExit ? 2 : 1;
    if (window.history.length > steps) window.history.go(-steps);
    else router.replace(localizedPath("/", language));
  }

  function requestExit() {
    if (confirmExit) showDialog();
    else leave();
  }

  useEffect(() => {
    if (!confirmExit) return;
    const plansUrl = window.location.href;
    const pushGuard = () => window.history.pushState({ topiqPlansExit: true }, "", plansUrl);
    if (!window.history.state?.topiqPlansExit) pushGuard();

    function back(event: PopStateEvent) {
      if (leaving.current || window.location.href !== plansUrl || event.state?.topiqPlansExit) return;
      event.stopImmediatePropagation();
      pushGuard();
      showDialog();
    }

    function unload(event: BeforeUnloadEvent) {
      if (leaving.current || checkout?.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function restore(event: PageTransitionEvent) {
      if (!event.persisted) return;
      leaving.current = false;
      if (checkout) checkout.current = false;
    }

    window.addEventListener("popstate", back, true);
    window.addEventListener("beforeunload", unload);
    window.addEventListener("pageshow", restore);
    return () => {
      window.removeEventListener("popstate", back, true);
      window.removeEventListener("beforeunload", unload);
      window.removeEventListener("pageshow", restore);
    };
  }, [confirmExit, checkout, showDialog]);

  return <header>
    <div className="plans-title-row">
      <h1 className="catalog-title">{p.title}</h1>
      <button type="button" className="button credits-secondary plans-close" aria-label={p.exit.close} onClick={requestExit}>
        <X size={20} aria-hidden="true" />
      </button>
    </div>
    <p className="catalog-description">{p.intro}</p>
    {confirmExit && <dialog ref={dialog} className="plans-exit-dialog" aria-labelledby="plans-exit-title" aria-describedby="plans-exit-description">
      <h2 id="plans-exit-title">{p.exit.title}</h2>
      <p id="plans-exit-description">{p.exit.description}</p>
      <div className="plans-exit-actions">
        <button type="button" className="button credits-secondary" onClick={leave}>{p.exit.yes}</button>
        <button type="button" className="button button-primary" ref={stayButton} onClick={() => dialog.current?.close()}>{p.exit.no}</button>
      </div>
    </dialog>}
  </header>;
}

function MemberPlans({ userId, returnId, cancelled }: { userId: number; returnId: string | null; cancelled: boolean }) {
  const { language, refreshSession, refreshCredits, updatePlan } = useApp();
  const a = authContent[language];
  const [data, setData] = useState<PlanAccount | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const checkout = useRef(false);
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
    <PlansHeading confirmExit={!error && data?.trialEligible === true && !data.active && !data.subscription}
      checkout={checkout} />
    {error ? <div className="catalog-status" role="alert">{a.network} <button className="button credits-secondary" onClick={reload}>{a.retry}</button></div>
      : !data ? <p className="catalog-status" role="status">{a.loading}</p> : null}
    <CreditPurchase userId={userId} returnId={returnId} cancelled={cancelled} planAccount={error ? null : data}
      onFulfilled={onFulfilled} onPlanRefresh={refreshPlan} onCheckout={() => { checkout.current = true; }} />
  </>;
}
