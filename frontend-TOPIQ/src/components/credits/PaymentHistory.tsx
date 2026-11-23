import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { creditsContent, paymentHistoryContent } from "@/lib/credits-content";
import { creditsRequest, refundTopup, WritingError, type TopupOrder } from "@/lib/writing/writing-api";
import BillingContactDialog from "./BillingContactDialog";

interface History { purchases: TopupOrder[]; nextPage: number | null }

export function PaymentRow({ order, amount, disabled, onRefund, onContact }: {
  order: TopupOrder; amount: string; disabled: boolean; onRefund: () => void; onContact: (orderId: string) => void;
}) {
  const { language } = useApp();
  const p = paymentHistoryContent[language];
  return <li>
    <div><time dateTime={order.paidAt}>{new Date(order.paidAt).toLocaleString(language)}</time>
      <strong>{amount}</strong>
      <span>{order.credits.toLocaleString(language)} {creditsContent[language].unit}
        {order.remainingCredits !== null && ` · ${p.remaining} ${order.remainingCredits.toLocaleString(language)}`}</span>
    </div>
    {order.refundState === "eligible" || order.refundState === "confirming"
      ? <button className="button credits-secondary" type="button" disabled={disabled} onClick={onRefund}>
        {order.refundState === "eligible" ? p.refund : p.confirming}</button>
      : order.refundState === "contact"
        ? <button className="button credits-secondary" type="button" aria-haspopup="dialog"
          onClick={() => onContact(order.id)}>{p.contact}</button>
        : <span role="status">{p[order.refundState]}</span>}
  </li>;
}

export default function PaymentHistory() {
  const { language, refreshSession, refreshCredits } = useApp();
  const t = creditsContent[language];
  const p = paymentHistoryContent[language];
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [notice, setNotice] = useState<"error" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const [contactOrderId, setContactOrderId] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setLoading(true);
    setLoadError(false);
    async function load() {
      try {
        const result = await creditsRequest<History>(`purchases/?page=${page}`, controller.signal);
        if (controller.signal.aborted) return;
        setData(result);
        if (result.purchases.some(order => order.refundState === "processing")) {
          timer = setTimeout(load, 8000);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setLoadError(true);
        if (error instanceof WritingError && error.status === 401) void refreshSession();
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [page, revision, refreshSession]);

  const money = (order: TopupOrder) => new Intl.NumberFormat(language, {
    style: "currency", currency: order.currency,
  }).format(order.amount);
  async function refund(order: TopupOrder) {
    if (operation.current) return;
    if (order.refundState === "eligible" && !window.confirm(p.confirm(money(order), order.credits.toLocaleString(language)))) return;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setNotice(null);
    try {
      const result = await refundTopup(order.id, controller.signal);
      if (controller.signal.aborted) return;
      if (result.refundState === "eligible") setNotice("failed");
      void refreshCredits(controller.signal).catch(() => {});
    } catch (error) {
      if (controller.signal.aborted) return;
      setNotice("error");
      if (error instanceof WritingError && error.status === 401) void refreshSession();
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        setLoading(true);
        setRevision(value => value + 1);
      }
      operation.current = null;
    }
  }

  return <>
    <Link className="settings-back" href="/credits">{p.back}</Link>
    <div className="credits-heading">
      <h1 className="catalog-title">{t.paymentHistory}</h1>
      <button className="button credits-secondary" type="button" disabled={loading || busy}
        onClick={() => setRevision(value => value + 1)}>{t.refresh}</button>
    </div>
    {notice && <p role="alert">{p[notice]}</p>}
    {loadError ? <p role="alert">{t.error}</p> : !data ? <p role="status">{t.loading}</p>
      : data.purchases.length ? <ul className="credits-order-list" aria-busy={loading}>
        {data.purchases.map(order => <PaymentRow key={order.id} order={order} amount={money(order)}
          disabled={busy || loading} onRefund={() => void refund(order)} onContact={setContactOrderId} />)}
      </ul> : <p>{p.empty}</p>}
    {data && (page > 1 || data.nextPage !== null) && <nav className="credits-pagination" aria-label={t.paymentHistory}>
      <button className="button credits-secondary" disabled={busy || loading || page === 1} onClick={() => { setData(null); setPage(page - 1); }}>{t.previous}</button>
      <span>{t.page} {page}</span>
      <button className="button credits-secondary" disabled={busy || loading || data.nextPage === null} onClick={() => { setData(null); setPage(page + 1); }}>{t.next}</button>
    </nav>}
    {contactOrderId && <BillingContactDialog key={contactOrderId} orderId={contactOrderId} onDismiss={() => setContactOrderId(null)} />}
  </>;
}
