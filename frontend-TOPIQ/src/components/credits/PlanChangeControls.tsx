import { useEffect, useId, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { plansContent } from "@/lib/plans-content";
import { cancelPlanChange, schedulePlanChange, WritingError, type PlanAccount,
  type ScheduledPlanChange, type SubscriptionAccount } from "@/lib/writing/writing-api";
import PlanOffers from "./PlanOffers";

export function usePlanRefresh(account: SubscriptionAccount | PlanAccount | null, reload: () => void) {
  useEffect(() => {
    const now = Date.now();
    const upcoming = [account?.endsAt, account?.nextBillingAt, account?.scheduledChange?.effectiveAt]
      .map(value => value ? Date.parse(value) : 0).filter(time => time > now);
    // Browsers accept at most a signed 32-bit timeout for long billing cycles.
    const timer = upcoming.length ? setTimeout(reload, Math.min(Math.min(...upcoming) - now, 2_147_483_647)) : undefined;
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) reload(); };
    window.addEventListener("pageshow", onPageShow);
    return () => { clearTimeout(timer); window.removeEventListener("pageshow", onPageShow); };
  }, [account, reload]);
}

export default function PlanChangeControls({ account, onRefresh }: {
  account: PlanAccount | SubscriptionAccount;
  onRefresh: (change?: ScheduledPlanChange | null) => void;
}) {
  const { language, refreshSession } = useApp();
  const p = plansContent[language];
  const { scheduledChange, nextBillingAt, subscription } = account;
  const currentMonths = subscription?.months ?? account.currentPlanMonths;
  const reasonId = useId();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<"cancelled" | "conflict" | "error" | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  const money = new Intl.NumberFormat(language, { style: "currency", currency: "KRW" });
  const date = new Intl.DateTimeFormat(language, {
    year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });

  async function submit(effectiveAt: string, send: (signal: AbortSignal) => Promise<{ scheduledChange: ScheduledPlanChange | null }>) {
    if (operation.current) return;
    if (Date.parse(effectiveAt) <= Date.now()) {
      setNotice("conflict");
      onRefresh();
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      const { scheduledChange: change } = await send(controller.signal);
      if (controller.signal.aborted) return;
      if (!change) setNotice("cancelled");
      onRefresh(change);
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotice(error instanceof WritingError && error.status === 409 ? "conflict" : "error");
      if (error instanceof WritingError && error.status === 401) void refreshSession();
      else onRefresh();
    } finally {
      operation.current = null;
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  const canSchedule = !account.planChangeUnavailable && account.canChangePlan && !scheduledChange
    && nextBillingAt && Date.parse(nextBillingAt) > Date.now() && subscription?.state === "active";
  return <>
    {"plans" in account && <PlanOffers language={language} account={account} renderAction={({ months, amount, priceId }) => {
      if (!currentMonths || months <= currentMonths) return null;
      if (canSchedule && nextBillingAt && priceId) {
        return <ChangeOffer key={`${nextBillingAt}:${priceId}:${amount}`} months={months} busy={busy}
          effectiveAt={nextBillingAt} date={date.format(new Date(nextBillingAt))} today={money.format(0)} amount={money.format(amount)}
          onConfirm={() => void submit(nextBillingAt, signal => schedulePlanChange(months, priceId, nextBillingAt, signal))} />;
      }
      const status = { active: priceId ? p.change.cannotSchedule : p.unavailable, ending: p.ending, past_due: p.pastDue };
      const reason = account.planChangeUnavailable ? p.change.unavailable : scheduledChange ? p.change.alreadyScheduled
        : subscription ? status[subscription.state] : p.prepaid;
      const description = `${reasonId}-${months}`;
      return <>
        <button type="button" className="button button-primary" disabled aria-describedby={description}>{p.change.select(months)}</button>
        <p id={description} className="text-sm text-muted">{reason}</p>
      </>;
    }} />}
    {scheduledChange && <div className="my-3 w-full space-y-2">
      <p role="status">{p.change.scheduled(p.term(scheduledChange.months), date.format(new Date(scheduledChange.effectiveAt)),
        money.format(scheduledChange.amount))}</p>
      {!account.planChangeUnavailable && Date.parse(scheduledChange.effectiveAt) > Date.now() && <>
        <button type="button" className="button credits-secondary" disabled={busy}
          onClick={() => void submit(scheduledChange.effectiveAt, signal => cancelPlanChange(scheduledChange, signal))}>
          {p.change.cancel(scheduledChange.months)}
        </button>
        {"canOpenBillingPortal" in account && <p className="text-sm text-muted">{p.change.cancelBeforeEnding}</p>}
      </>}
    </div>}
    {account.planChangeUnavailable && <div className="my-3 w-full">
      <p role="alert">{p.change.unavailable}</p>
      <button type="button" className="button credits-secondary" onClick={() => onRefresh()}>{authContent[language].retry}</button>
    </div>}
    {notice && !(notice === "cancelled" && scheduledChange) && <p className="w-full text-sm" role={notice === "cancelled" ? "status" : "alert"}>{p.change[notice]}</p>}
  </>;
}

function ChangeOffer({ months, busy, effectiveAt, date, today, amount, onConfirm }: {
  months: number; busy: boolean; effectiveAt: string; date: string; today: string; amount: string; onConfirm: () => void;
}) {
  const { language } = useApp();
  const p = plansContent[language];
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useId();
  return <>
    <button type="button" className="button button-primary" disabled={busy} aria-haspopup="dialog"
      onClick={() => dialog.current?.showModal()}>{p.change.select(months)}</button>
    <dialog ref={dialog} className="billing-contact-dialog" aria-labelledby={title}>
      <h2 id={title}>{p.change.select(months)}</h2>
      <dl>
        <div><dt>{p.change.today}</dt><dd>{today}</dd></div>
        <div><dt>{p.change.effective}</dt><dd><time dateTime={effectiveAt}>{date}</time></dd></div>
        <div><dt>{p.change.nextCharge}</dt><dd>{amount} · {p.interval(months)}</dd></div>
      </dl>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className="button credits-secondary" onClick={() => dialog.current?.close()}>{p.change.back}</button>
        <button type="button" className="button button-primary" disabled={busy}
          onClick={() => { dialog.current?.close(); onConfirm(); }}>{p.change.confirm}</button>
      </div>
    </dialog>
  </>;
}
