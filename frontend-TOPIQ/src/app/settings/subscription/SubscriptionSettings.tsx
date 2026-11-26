"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import PlanChangeControls, { usePlanRefresh } from "@/components/credits/PlanChangeControls";
import { authContent } from "@/lib/auth/auth-content";
import { localizedPath } from "@/lib/locale-path";
import { billingTime, planAmount, plansContent } from "@/lib/plans-content";
import { getMySubscription, openBillingPortal, WritingError, type ScheduledPlanChange, type SubscriptionAccount } from "@/lib/writing/writing-api";

export default function SubscriptionSettings() {
  const { user, status, language, refreshSession } = useApp();
  const a = authContent[language];
  if (status === "loading") return <p role="status">{a.loading}</p>;
  if (status === "error") return <div className="catalog-status" role="alert">
    <p>{a.network}</p><button type="button" className="button credits-secondary" onClick={refreshSession}>{a.retry}</button>
  </div>;
  if (!user) {
    const next = localizedPath("/settings/subscription", language);
    return <Link className="button button-primary" href={`${localizedPath("/login", language)}?next=${encodeURIComponent(next)}`}>{a.login}</Link>;
  }
  return <MemberSubscription key={user.id} userId={user.id} />;
}

function MemberSubscription({ userId }: { userId: number }) {
  const { language, refreshSession, updatePlan } = useApp();
  const a = authContent[language];
  const [account, setAccount] = useState<SubscriptionAccount | null>(null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  usePlanRefresh(account, reload);
  function refreshPlan(change?: ScheduledPlanChange | null) {
    if (change !== undefined) setAccount(current => current && { ...current, scheduledChange: change });
    reload();
  }

  useEffect(() => {
    const controller = new AbortController();
    setFailed(false);
    getMySubscription(controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setAccount(value);
      updatePlan(userId, value.endsAt);
    }).catch(error => {
      if (controller.signal.aborted) return;
      setFailed(true);
      if (error instanceof WritingError && error.status === 401) void refreshSession();
    });
    return () => controller.abort();
  }, [revision, userId, updatePlan, refreshSession]);

  if (failed) return <div className="catalog-status" role="alert">
    <p>{a.network}</p><button type="button" className="button credits-secondary" onClick={() => setRevision(value => value + 1)}>{a.retry}</button>
  </div>;
  return account ? <SubscriptionSummary account={account} onRefresh={refreshPlan} /> : <p role="status">{a.loading}</p>;
}

export function SubscriptionSummary({ account, onRefresh }: {
  account: SubscriptionAccount; onRefresh: (change?: ScheduledPlanChange | null) => void;
}) {
  const { language } = useApp();
  const p = plansContent[language];
  const { subscription, currentPlanMonths, endsAt, canOpenBillingPortal, trialEndsAt, firstChargeAmount } = account;
  const months = currentPlanMonths ?? subscription?.months;
  const inTrial = Boolean(trialEndsAt && Date.parse(trialEndsAt) > Date.now());
  const endingTrial = inTrial && subscription?.state === "ending";
  const renewalStatus = { active: p.details.renewing, trialing: inTrial ? p.trial.active : p.trial.billingPending,
    ending: endingTrial ? p.trial.noCharge : p.ending, past_due: p.pastDue };
  const rows = [
    { label: p.details.status, value: subscription ? renewalStatus[subscription.state] : p.details.nonrenewing },
    ...(subscription ? [{ label: p.details.cycle, value: p.interval(subscription.months) }] : []),
    { label: inTrial ? p.trial.accessEnds : p.until, value: endsAt ? <time dateTime={endsAt}>{billingTime(language, endsAt)}</time> : p.details.noPaidPeriod },
    ...(inTrial && !endingTrial && trialEndsAt && firstChargeAmount != null ? [
      { label: p.trial.firstCharge, value: <time dateTime={trialEndsAt}>{billingTime(language, trialEndsAt)}</time> },
      { label: p.change.nextCharge, value: `${planAmount(language, firstChargeAmount)} · ${p.interval(1)}` },
    ] : []),
  ];
  return <section aria-labelledby="subscription-plan" className="max-w-2xl rounded-xl border border-slate-200 p-5 sm:p-7">
    <p className="text-sm text-muted">{p.details.myPlan}</p>
    <h2 id="subscription-plan" className="mt-1 text-2xl font-semibold">{months ? p.term(months) : "Free"}</h2>
    {months ? <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
      {rows.map(({ label, value }) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[9rem_1fr] sm:gap-4">
        <dt className="text-muted">{label}</dt><dd className="font-medium">{value}</dd>
      </div>)}
    </dl> : <p className="mt-3 text-muted">{p.details.free}</p>}
    <PlanChangeControls account={account} onRefresh={onRefresh} />
    <div className="mt-5 flex flex-wrap items-start gap-3">
      {canOpenBillingPortal && <BillingPortalButton />}
      {(!canOpenBillingPortal || !months || account.canChangePlan && !account.scheduledChange) &&
        <Link className="button credits-secondary" href={localizedPath("/plans", language)}>{p.details.seePlans}</Link>}
    </div>
  </section>;
}

function BillingPortalButton() {
  const { language, refreshSession } = useApp();
  const p = plansContent[language];
  const [status, setStatus] = useState<"idle" | "opening" | "error">("idle");
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  async function openPortal() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setStatus("opening");
    try {
      const { portalUrl } = await openBillingPortal(controller.signal,
        language === "ko" ? "settings/subscription" : `${language}/settings/subscription`);
      if (controller.signal.aborted) return;
      if (portalUrl) window.location.assign(portalUrl);
      setStatus(portalUrl ? "idle" : "error");
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus("error");
      if (error instanceof WritingError && error.status === 401) void refreshSession();
    } finally {
      operation.current = null;
    }
  }

  return <div>
    <button type="button" className="button button-primary" disabled={status === "opening"}
      aria-busy={status === "opening"} onClick={openPortal}>{p.manage}</button>
    {status === "error" && <p className="mt-2 text-muted" role="alert">{p.portalUnavailable}</p>}
  </div>;
}
