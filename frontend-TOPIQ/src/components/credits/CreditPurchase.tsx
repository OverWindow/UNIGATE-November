import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { creditsContent } from "@/lib/credits-content";
import { creditsRequest, startCreditPurchase, WritingError, type CreditPrice, type CreditPurchaseStatus } from "@/lib/writing/writing-api";

type Notice = keyof typeof creditsContent.ko.checkout;
interface Attempt { attemptId: string; price: CreditPrice; orderId?: string }

function savedAttempt(key: string): Attempt | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) || "null") as Attempt | null;
    if (value && typeof value.attemptId === "string" && typeof value.price?.priceId === "string"
      && value.price.currency === "krw" && Number.isSafeInteger(value.price.amount)
      && Number.isSafeInteger(value.price.credits)) return value;
  } catch { /* Storage may be unavailable. */ }
  return null;
}

export default function CreditPurchase({ userId, returnId, cancelled, onFulfilled }: {
  userId: number; returnId: string | null; cancelled: boolean; onFulfilled: () => void;
}) {
  const { language, refreshSession } = useApp();
  const t = creditsContent[language];
  const storageKey = `topiq-credit-purchase:${userId}`;
  const [initialAttempt] = useState(() => savedAttempt(storageKey));
  const attempt = useRef<Attempt | null>(initialAttempt);
  const [notice, setNotice] = useState<Notice | null>(returnId ? "checking" : null);
  const [price, setPrice] = useState<CreditPrice | "unavailable" | null>(initialAttempt?.price ?? null);
  const [priceRevision, setPriceRevision] = useState(0);
  const [checkCount, setCheckCount] = useState(0);
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
    if (attempt.current) return;
    const controller = new AbortController();
    creditsRequest<CreditPrice>("price/", controller.signal).then(value => {
      if (!controller.signal.aborted) setPrice(value);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setPrice("unavailable");
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
    });
    return () => controller.abort();
  }, [priceRevision, refreshSession]);

  const reloadPrice = useCallback(() => {
    setPrice(null);
    setPriceRevision(value => value + 1);
  }, []);

  const finish = useCallback((order: CreditPurchaseStatus) => {
    if (attempt.current?.orderId === order.id) {
      remember(null);
      reloadPrice();
    }
    if (order.status === "fulfilled") onFulfilled();
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
        const order = await creditsRequest<CreditPurchaseStatus>(`purchases/${returnId}/`, controller.signal);
        if (controller.signal.aborted) return;
        if (order.status !== "pending") finish(order);
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
  }, [returnId, cancelled, checkCount, finish, refreshSession]);

  async function buy() {
    if (operation.current) return;
    const selected = attempt.current?.price ?? price;
    if (!selected || selected === "unavailable") return;
    const controller = new AbortController();
    operation.current = controller;
    setNotice("opening");
    try {
      const current = attempt.current ?? { attemptId: crypto.randomUUID(), price: selected };
      // Persist before sending the request so a lost response can be retried.
      remember(current);
      const order = await startCreditPurchase(current.attemptId, current.price.priceId, controller.signal);
      if (controller.signal.aborted) return;
      remember({ ...current, orderId: order.id });
      if (order.status !== "pending") finish(order);
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
      } else {
        setNotice("startError");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    } finally {
      if (operation.current === controller) operation.current = null;
    }
  }

  const retryCheck = notice === "delayed" || notice === "checkError";
  const blocked = notice === "opening" || notice === "checking" || retryCheck;
  return <div className="credits-purchase">
    {price === "unavailable" ? <>
      <p role="status">{t.priceUnavailable}</p>
      <button type="button" className="button credits-secondary" onClick={reloadPrice}>{t.retry}</button>
    </> : price ? <button type="button" className="button button-primary" disabled={blocked} onClick={() => void buy()}>
      {t.buy(price.credits.toLocaleString(language), price.amount.toLocaleString(language))}
    </button> : <p role="status">{t.priceLoading}</p>}
    {notice && <p role="status">{t.checkout[notice]}</p>}
    {retryCheck && <button type="button" className="button credits-secondary" onClick={() => setCheckCount(count => count + 1)}>{t.checkAgain}</button>}
  </div>;
}
