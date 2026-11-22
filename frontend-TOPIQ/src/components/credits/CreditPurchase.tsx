import { useCallback, useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";
import { useApp } from "@/app/providers";
import { creditsContent } from "@/lib/credits-content";
import { plansContent } from "@/lib/plans-content";
import { creditsRequest, openBillingPortal, startCreditPurchase, startPlanPurchase, WritingError, type CreditPrice, type CreditPurchaseStatus, type PlanAccount } from "@/lib/writing/writing-api";

type Notice = keyof typeof creditsContent.ko.checkout | "planInUse";
type CheckoutPrice = CreditPrice & { months?: number };
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

export default function CreditPurchase({ userId, returnId, cancelled, onFulfilled, planAccount, onPriceChanged }: {
  userId: number; returnId: string | null; cancelled: boolean; onFulfilled: (signal: AbortSignal) => void;
  planAccount?: PlanAccount | null; onPriceChanged?: () => void;
}) {
  const { language, refreshSession } = useApp();
  const t = creditsContent[language];
  const p = plansContent[language];
  const isPlan = planAccount !== undefined;
  const checkoutCopy = isPlan ? { ...t.checkout, ...p.checkout } : t.checkout;
  const storageKey = `topiq-${isPlan ? "plan" : "credit"}-purchase:${userId}`;
  const [initialAttempt] = useState(() => savedAttempt(storageKey));
  const attempt = useRef<Attempt | null>(initialAttempt);
  const [notice, setNotice] = useState<Notice | null>(returnId ? "checking" : null);
  const [price, setPrice] = useState<CreditPrice | "unavailable" | null>(initialAttempt?.price ?? null);
  const [priceRevision, setPriceRevision] = useState(0);
  const [checkCount, setCheckCount] = useState(0);
  const [portalNotice, setPortalNotice] = useState<keyof typeof t.portal | null>(null);
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

  const finish = useCallback((order: CreditPurchaseStatus, signal: AbortSignal) => {
    if (attempt.current?.orderId === order.id) {
      remember(null);
      reloadPrice();
    }
    if (order.status === "fulfilled") onFulfilled(signal);
    setNotice(order.status === "fulfilled" ? "fulfilled" : "expired");
  }, [remember, reloadPrice, onFulfilled]);

  useEffect(() => {
    if (!returnId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let polls = 0;
    setNotice("checking");
    async function check() {
      try {
        const order = await creditsRequest<CreditPurchaseStatus>(`purchases/${returnId}/?product=${isPlan ? "plan" : "credit"}`, controller.signal);
        if (controller.signal.aborted) return;
        if (order.status !== "pending") finish(order, controller.signal);
        else if (cancelled) setNotice("cancelled");
        else if (++polls < 12) timer = setTimeout(check, 2500);
        else setNotice("delayed");
      } catch (cause) {
        if (controller.signal.aborted) return;
        setNotice(cause instanceof WritingError && cause.status === 404 ? "unavailable" : "checkError");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    }
    void check();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [returnId, cancelled, checkCount, finish, refreshSession, isPlan]);

  async function buy(offer?: CheckoutPrice) {
    if (operation.current) return;
    const selected = offer ?? attempt.current?.price ?? price;
    if (!selected || selected === "unavailable") return;
    const controller = new AbortController();
    operation.current = controller;
    setPortalNotice(null);
    setNotice("opening");
    try {
      const prior = attempt.current;
      const current = prior && prior.price.priceId === selected.priceId && prior.price.months === offer?.months
        ? prior : { attemptId: crypto.randomUUID(), price: selected };
      // Persist before sending the request so a lost response can be retried.
      remember(current);
      const order = offer?.months
        ? await startPlanPurchase(current.attemptId, selected.priceId, offer.months, controller.signal)
        : await startCreditPurchase(current.attemptId, selected.priceId, controller.signal);
      if (controller.signal.aborted) return;
      remember({ ...current, orderId: order.id });
      if (order.status !== "pending") finish(order, controller.signal);
      else if (order.checkoutUrl) {
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
      if (cause instanceof WritingError && cause.status === 409 && cause.code === "price_changed") {
        remember(null);
        setNotice("priceChanged");
        reloadPrice();
        onPriceChanged?.();
      } else if (cause instanceof WritingError && cause.code === "plan_in_use") {
        remember(null);
        setNotice("planInUse");
        onPriceChanged?.();
      } else {
        setNotice("startError");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }

  async function viewPayments() {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setPortalNotice("opening");
    try {
      const { portalUrl } = await openBillingPortal(controller.signal, isPlan ? "plans" : "credits");
      if (controller.signal.aborted) return;
      if (portalUrl) window.location.assign(portalUrl);
      setPortalNotice(portalUrl ? null : "empty");
    } catch (cause) {
      if (controller.signal.aborted) return;
      setPortalNotice("error");
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }

  const retryCheck = notice === "delayed" || notice === "checkError";
  const opening = notice === "opening" || portalNotice === "opening";
  const blocked = opening || notice === "checking" || retryCheck;
  const canSubscribe = planAccount && !planAccount.active && !planAccount.subscription;
  const currentBadge = <span className="plan-current-badge">{p.current}</span>;
  return <div className="credits-purchase">
    {!isPlan && price && price !== "unavailable" && <p className="card-issuer-notice" id="credit-card-notice">{t.cardIssuerNotice}</p>}
    {isPlan ? planAccount && <div className="plan-offers">
      <article className="plan-offer plan-free" aria-current={!planAccount.active || undefined}>
        <div className="plan-heading"><h2>Free</h2>{!planAccount.active && currentBadge}</div>
        <p className="plan-price">{new Intl.NumberFormat(language, { style: "currency", currency: "KRW" }).format(0)}</p>
        <ul className="plan-benefits" role="list">{p.freeBenefits.map(benefit =>
          <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
        )}</ul>
      </article>
      {planAccount.plans.map(offer => {
      const { months, priceId, currency, amount, bonusCredits } = offer;
      const term = p.term(months);
      const current = planAccount.currentPlanMonths === months;
      const subscription = planAccount.subscription?.months === months ? planAccount.subscription : null;
      return <article className="plan-offer" key={months} aria-current={current || undefined}>
        <div className="plan-heading"><h2>{term}</h2>{current && currentBadge}</div>
        <p className="plan-price">{new Intl.NumberFormat(language, { style: "currency", currency }).format(amount)}
          <small>{p.interval(months)}</small></p>
        <ul className="plan-benefits" role="list">{p.benefits(bonusCredits).map(benefit =>
          <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
        )}</ul>
        {current && planAccount.endsAt && <p className="plan-period">
          {subscription?.state === "active" ? p.renewal : p.until}{" "}
          <time dateTime={planAccount.endsAt}>{new Date(planAccount.endsAt).toLocaleString(language, { dateStyle: "long", timeStyle: "short" })}</time>
        </p>}
        {current && !planAccount.subscription && <p>{p.prepaid}</p>}
        {subscription?.state === "ending" && <p>{p.ending}</p>}
        {subscription?.state === "past_due" && <p>{p.pastDue}</p>}
        {canSubscribe && <p className="card-issuer-notice" id={`plan-card-notice-${months}`}>{t.cardIssuerNotice}</p>}
        {canSubscribe && <button type="button" className="button button-primary" disabled={blocked || !priceId}
          aria-label={`${term} · ${priceId ? p.buy : p.unavailable}`}
          aria-describedby={`plan-card-notice-${months}`}
          onClick={() => priceId && void buy({ priceId, currency, amount, credits: bonusCredits, months })}>
          {priceId ? p.buy : p.unavailable}
        </button>}
      </article>;
    })}</div> : price === "unavailable" ? <>
      <p role="status">{t.priceUnavailable}</p>
      <button type="button" className="button credits-secondary" onClick={reloadPrice}>{t.retry}</button>
    </> : price ? <button type="button" className="button button-primary" aria-describedby="credit-card-notice" disabled={blocked} onClick={() => void buy()}>
      {t.buy(price.credits.toLocaleString(language), price.amount.toLocaleString(language))}
    </button> : <p role="status">{t.priceLoading}</p>}
    {(!isPlan || planAccount?.subscription) && <button type="button" className="button credits-secondary" disabled={opening} onClick={() => void viewPayments()}>
      {isPlan ? p.manage : t.paymentHistory}
    </button>}
    {portalNotice && <p role="status">{t.portal[portalNotice]}</p>}
    {notice && <p role="status">{notice === "planInUse" ? p.inUse : checkoutCopy[notice]}</p>}
    {retryCheck && <button type="button" className="button credits-secondary" onClick={() => setCheckCount(count => count + 1)}>{t.checkAgain}</button>}
  </div>;
}
