import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { creditsContent } from "@/lib/credits-content";
import { localizedPath } from "@/lib/locale-path";
import { plansContent } from "@/lib/plans-content";
import { confirmMonthlyTrial, creditsRequest, startCreditPurchase, startPlanPurchase, trialQuote, WritingError, type CreditPrice,
  type CreditPurchaseStatus, type MonthlyPlanOffer, type PlanAccount, type ScheduledPlanChange, type TrialQuote } from "@/lib/writing/writing-api";
import PlanChangeControls from "./PlanChangeControls";
import PlanOffers from "./PlanOffers";
import TrialConsent from "./TrialConsent";

type Notice = keyof typeof creditsContent.ko.checkout | "planInUse" | "cardUsed" | "accountUsed" | "cardUnavailable" |
  "trialChecking" | "trialCreating" | "trialStarted" | "trialEnded" | "trialExit" | "trialDelayed";
type CheckoutPrice = CreditPrice & { months?: number; monthlyOffer?: MonthlyPlanOffer };
interface Attempt { attemptId: string; price: CheckoutPrice; orderId?: string }

function savedAttempt(key: string): Attempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null") as Attempt | null;
    if (value && typeof value.attemptId === "string" && typeof value.price?.priceId === "string"
      && value.price.currency === "krw" && Number.isSafeInteger(value.price.amount)
      && Number.isSafeInteger(value.price.credits)) return value;
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export default function CreditPurchase({ userId, returnId, cancelled, onFulfilled, planAccount, onPlanRefresh, onCheckout }: {
  userId: number; returnId: string | null; cancelled: boolean; onFulfilled: (signal: AbortSignal) => void;
  onCheckout?: () => void;
} & ({ planAccount: PlanAccount | null; onPlanRefresh: (change?: ScheduledPlanChange | null) => void }
  | { planAccount?: undefined; onPlanRefresh?: undefined })) {
  const { language, setLanguage, refreshSession } = useApp();
  const t = creditsContent[language];
  const p = plansContent[language];
  const isPlan = planAccount !== undefined;
  const storageKey = `topiq-${isPlan ? "plan" : "credit"}-purchase:${userId}`;
  const [initialAttempt] = useState(() => savedAttempt(storageKey));
  const attempt = useRef<Attempt | null>(initialAttempt);
  const [notice, setNotice] = useState<Notice | null>(returnId ? "checking" : null);
  const [price, setPrice] = useState<CreditPrice | "unavailable" | null>(initialAttempt?.price ?? null);
  const [priceRevision, setPriceRevision] = useState(0);
  const [checkCount, setCheckCount] = useState(0);
  const [consent, setConsent] = useState<{ id: string; quote: TrialQuote } | null>(null);
  const [consentNotice, setConsentNotice] = useState<"termsChanged" | "confirmAgain" | null>(null);
  const operation = useRef<AbortController | null>(null);

  const remember = useCallback((value: Attempt | null) => {
    attempt.current = value;
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch { /* Keep the attempt in memory when storage is unavailable. */ }
  }, [storageKey]);

  useEffect(() => () => operation.current?.abort(), []);

  useEffect(() => {
    if (isPlan || attempt.current) return;
    const controller = new AbortController();
    creditsRequest<CreditPrice>("price/", controller.signal).then(value => {
      if (!controller.signal.aborted) setPrice(value);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setPrice("unavailable");
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
    });
    return () => controller.abort();
  }, [isPlan, priceRevision, refreshSession]);

  const reloadPrice = useCallback(() => {
    setPrice(null);
    setPriceRevision(value => value + 1);
  }, []);

  const finish = useCallback((order: CreditPurchaseStatus, result: Notice, signal: AbortSignal) => {
    if (attempt.current?.orderId === order.id) {
      remember(null);
      reloadPrice();
    }
    if (isPlan || order.status === "fulfilled") onFulfilled(signal);
    setConsent(null);
    setConsentNotice(null);
    setNotice(result);
  }, [remember, reloadPrice, onFulfilled, isPlan]);

  const applyOrder = useCallback((order: CreditPurchaseStatus, signal: AbortSignal) => {
    const trial = order.trial;
    if (order.status === "fulfilled") finish(order, "fulfilled", signal);
    else if (trial?.status === "card_used") finish(order, "cardUsed", signal);
    else if (trial?.status === "card_unavailable") finish(order, "cardUnavailable", signal);
    else if (trial?.status === "account_used") finish(order, "accountUsed", signal);
    else if (order.status === "expired" || trial?.status === "ended") finish(order, trial ? "trialEnded" : "expired", signal);
    else if (trial?.status === "started") {
      const active = trial.endsAt && Date.parse(trial.endsAt) > Date.now();
      finish(order, active ? "trialStarted" : "trialEnded", signal);
    } else if (trial?.status === "awaiting_consent") {
      const quote = trialQuote(trial);
      setConsent(quote ? { id: order.id, quote } : null);
      setNotice(quote ? null : "checkError");
    } else return false;
    return true;
  }, [finish]);

  useEffect(() => {
    setConsent(null);
    if (!returnId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    setNotice("checking");
    async function check() {
      try {
        const order = await creditsRequest<CreditPurchaseStatus>(`purchases/${returnId}/?product=${isPlan ? "plan" : "credit"}`, controller.signal);
        if (controller.signal.aborted) return;
        if (applyOrder(order, controller.signal)) return;
        if (cancelled && order.trial?.status !== "creating") {
          setNotice(order.trial ? "trialExit" : "cancelled");
          return;
        }
        if (++polls >= 12) setNotice(order.trial ? "trialDelayed" : "delayed");
        else {
          setNotice(order.trial?.status === "creating" ? "trialCreating" : order.trial ? "trialChecking" : "checking");
          timer = setTimeout(check, 2500);
        }
      } catch (cause) {
        if (controller.signal.aborted) return;
        setNotice(cause instanceof WritingError && cause.status === 404 ? "unavailable" : "checkError");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [returnId, cancelled, checkCount, applyOrder, refreshSession, isPlan]);

  async function confirmTrial() {
    if (!consent || operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setNotice("trialCreating");
    setConsentNotice(null);
    try {
      const result = await confirmMonthlyTrial(consent.id, consent.quote, controller.signal);
      if (!controller.signal.aborted && !applyOrder(result, controller.signal)) setCheckCount(count => count + 1);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error instanceof WritingError && error.status === 401) void refreshSession();
      else {
        // A lost response can follow successful creation. Reconcile this order before offering another action.
        setConsentNotice(error instanceof WritingError && error.code === "trial_terms_changed" ? "termsChanged" : "confirmAgain");
        setCheckCount(count => count + 1);
      }
    } finally {
      operation.current = null;
    }
  }

  async function buy(offer?: CheckoutPrice) {
    if (operation.current) return;
    const selected = offer ?? attempt.current?.price ?? price;
    if (!selected || selected === "unavailable") return;
    const controller = new AbortController();
    operation.current = controller;
    setNotice("opening");
    setConsentNotice(null);
    try {
      const prior = attempt.current;
      const priorOffer = prior?.price.monthlyOffer ?? (prior?.price.months === 1 ? "monthly_trial" : undefined);
      const current = prior && prior.price.priceId === selected.priceId && prior.price.months === offer?.months
        && priorOffer === offer?.monthlyOffer
        ? prior : { attemptId: crypto.randomUUID(), price: selected };
      // Persist before sending the request so a lost response can be retried.
      remember(current);
      const order = offer?.months
        ? await startPlanPurchase(current.attemptId, selected.priceId, offer.months, controller.signal, offer.monthlyOffer)
        : await startCreditPurchase(current.attemptId, selected.priceId, controller.signal);
      if (controller.signal.aborted) return;
      remember({ ...current, orderId: order.id });
      if (order.status !== "pending") applyOrder(order, controller.signal);
      else if (order.checkoutUrl) {
        // Stripe's shared return URL has no locale prefix.
        if (isPlan) setLanguage(language);
        onCheckout?.();
        window.location.assign(order.checkoutUrl);
        setNotice(null);
      } else {
        const url = new URL(window.location.href);
        url.searchParams.set("purchase", order.id);
        url.searchParams.delete("cancelled");
        window.history.replaceState(null, "", url);
        setNotice("checking");
        setCheckCount(count => count + 1);
      }
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof WritingError && ["price_changed", "trial_offer_changed"].includes(cause.code)) {
        remember(null);
        setNotice("priceChanged");
        reloadPrice();
        onPlanRefresh?.();
      } else if (cause instanceof WritingError && ["plan_in_use", "trial_account_used"].includes(cause.code)) {
        remember(null);
        setNotice(cause.code === "trial_account_used" ? "accountUsed" : "planInUse");
        onPlanRefresh?.();
      } else {
        setNotice("startError");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }

  const retryCheck = notice === "delayed" || notice === "trialDelayed" || notice === "checkError";
  const blocked = notice === "opening" || notice === "checking" || notice === "trialChecking" || notice === "trialCreating" || retryCheck;
  const canSubscribe = planAccount && !planAccount.active && !planAccount.subscription;
  const trialNotices = { trialChecking: p.trial.checking, trialCreating: p.trial.creating, trialDelayed: p.trial.delayed,
    trialStarted: p.trial.started, trialEnded: p.trial.ended, cardUsed: p.trial.cardUsed, accountUsed: p.trial.accountUsed,
    cardUnavailable: p.trial.cardUnavailable, trialExit: p.trial.exit, planInUse: p.inUse };
  const messages = { ...t.checkout, ...(isPlan ? p.checkout : {}), ...trialNotices };
  return <div className="credits-purchase">
    {isPlan && notice && <p className="w-full" role="status">{messages[notice]}</p>}
    {consent && consentNotice && <p className="w-full" role="alert">{p.trial[consentNotice]}</p>}
    {consent && <TrialConsent key={JSON.stringify([consent.id, consent.quote, language])} quote={consent.quote}
      busy={notice === "trialCreating"} onConfirm={() => void confirmTrial()} />}
    {isPlan ? planAccount && !consent && (canSubscribe ? <PlanOffers language={language} account={planAccount}
      renderAction={({ months, priceId, currency, amount, bonusCredits, trialDays }) => {
        const monthlyOffer = months !== 1 ? undefined : planAccount.trialEligible === false
          ? "monthly_paid" : trialDays === 7 && planAccount.trialEligible === true ? "monthly_trial" : undefined;
        const available = priceId && (months !== 1 || monthlyOffer);
        const label = !available ? p.unavailable : monthlyOffer === "monthly_trial" ? p.trial.start : p.trial.pay;
        return <button type="button" className={`button ${months === 1 ? "button-primary" : "plan-pay-button"}`} disabled={blocked || !available}
          aria-label={`${p.term(months)} · ${label}`} aria-describedby="plan-card-notice"
          onClick={() => available && priceId && void buy({ priceId, currency, amount, credits: bonusCredits, months, monthlyOffer })}>{label}</button>;
      }} /> : <PlanChangeControls account={planAccount} onRefresh={onPlanRefresh} />) : price === "unavailable" ? <>
      <p role="status">{t.priceUnavailable}</p>
      <button type="button" className="button credits-secondary" onClick={reloadPrice}>{t.retry}</button>
    </> : price ? <>
      <button type="button" className="credits-topup-button" aria-describedby="credit-card-notice" disabled={blocked} onClick={() => void buy()}>
        {t.topup}
      </button>
    </> : <p role="status">{t.priceLoading}</p>}
    {(planAccount?.active || planAccount?.subscription) && <Link className="button credits-secondary"
      href={localizedPath("/settings/subscription", language)}>{p.settingsTitle}</Link>}
    {retryCheck && <button type="button" className="button credits-secondary" onClick={() => setCheckCount(count => count + 1)}>
      {notice === "trialDelayed" ? p.trial.retry : t.checkAgain}</button>}
  </div>;
}
