"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Info, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { creditsContent } from "@/lib/credits-content";
import { creditsRequest, WritingError, type CreditBalance, type CreditEntry } from "@/lib/writing/writing-api";
import CreditPurchase from "./CreditPurchase";
import PaymentHistory from "./PaymentHistory";

export default function CreditsAccount() {
  const { user, status, language, refreshSession } = useApp();
  const t = creditsContent[language];
  const a = authContent[language];
  const search = useSearchParams();
  const purchase = search.get("purchase");
  const returnId = purchase && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(purchase) ? purchase : null;
  const cancelled = search.get("cancelled") === "1";
  const history = search.get("history") === "payments";
  const next = history ? "/credits?history=payments" : returnId ? `/credits?purchase=${returnId}${cancelled ? "&cancelled=1" : ""}` : "/credits";
  return <div className="page-container credits-page">
    {(status !== "authenticated" || !user) && <div className="credits-heading"><h1 className="catalog-title">{t.title}</h1></div>}
    {status === "loading" ? <p className="catalog-status" role="status">{a.loading}</p>
      : status === "error" ? <div className="catalog-status" role="alert"><p>{a.network}</p><button className="button credits-secondary" onClick={() => void refreshSession()}>{a.retry}</button></div>
      : status !== "authenticated" || !user ? <div className="catalog-status"><p>{t.loginRequired}</p><Link className="button button-primary" href={`/login?next=${encodeURIComponent(next)}`}>{a.login}</Link></div>
      : history ? <PaymentHistory key={user.id} />
      : <CreditWallet key={user.id} userId={user.id} returnId={returnId} cancelled={cancelled} />}
  </div>;
}

interface WalletData {
  page: number;
  balance: CreditBalance;
  transactions: CreditEntry[];
  nextPage: number | null;
}

function CreditWallet({ userId, returnId, cancelled }: { userId: number; returnId: string | null; cancelled: boolean }) {
  const { language, refreshSession, refreshCredits } = useApp();
  const t = creditsContent[language];
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(false);
    async function load() {
      try {
        // Read the ledger after the balance endpoint has released expired reservations.
        const balance = await refreshCredits(controller.signal);
        const history = await creditsRequest<{ transactions: CreditEntry[]; nextPage: number | null }>(`transactions/?page=${page}`, controller.signal);
        if (!controller.signal.aborted) setData({ page, balance, ...history });
      } catch (cause) {
        if (controller.signal.aborted) return;
        setError(true);
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [page, revision, refreshSession, refreshCredits]);

  const current = data;
  const number = (value: number) => value.toLocaleString(language);
  function refresh(nextPage = page) {
    setLoading(true); setError(false); setPage(nextPage); setRevision(value => value + 1);
  }
  const refreshAfterPurchase = useCallback(() => {
    setPage(1);
    setRevision(value => value + 1);
  }, []);

  return <>
    <div className="credits-heading">
      <h1 className="catalog-title">{t.title}</h1>
      <button className="button credits-secondary credits-refresh" type="button" aria-label={t.refresh} title={t.refresh}
        disabled={loading} aria-busy={loading} onClick={() => refresh()}>
        <RefreshCw size={20} strokeWidth={1.8} aria-hidden="true" />
      </button>
    </div>
    {error && <div className="catalog-status" role="alert"><p>{t.error}</p><button className="button credits-secondary" onClick={() => refresh()}>{t.retry}</button></div>}
    {!current && !error && <p className="catalog-status credits-loading" role="status"><RefreshCw className="credits-loading-icon" size={20} aria-hidden="true" />{t.loading}</p>}
    {current && <div className="credits-content" aria-busy={loading}>
        <dl className="credits-balances">
          <div className="credits-available"><dt>{t.available}</dt><dd>{number(current.balance.available)} <span>{t.unit}</span></dd></div>
          <div><dt>{t.balance}</dt><dd>{number(current.balance.balance)} <span>{t.unit}</span></dd></div>
          <div><dt>{t.reserved}</dt><dd>{number(current.balance.reserved)} <span>{t.unit}</span></dd></div>
        </dl>
        {!!current.balance.pendingRefundCredits && <p role="status">{t.pendingRefund(number(current.balance.pendingRefundCredits))}</p>}
      </div>}
    <CreditPurchase userId={userId} returnId={returnId} cancelled={cancelled} onFulfilled={refreshAfterPurchase} />
    {current && <div className="credits-content" aria-busy={loading}>
        <section className="credits-history" aria-labelledby="credit-transactions-heading">
          <div className="credits-history-heading">
            <h2 id="credit-transactions-heading">{t.transactions}</h2>
            <span className="credits-info" onMouseEnter={() => setInfoOpen(true)} onMouseLeave={() => setInfoOpen(false)}
              onFocus={() => setInfoOpen(true)} onBlur={() => setInfoOpen(false)}
              onKeyDown={event => { if (event.key === "Escape") setInfoOpen(false); }}>
              <button className="credits-info-trigger" type="button" aria-label={`${t.transactions} · ${t.reserved}`}
                aria-describedby={infoOpen ? "credit-reservation-info" : undefined} onClick={() => setInfoOpen(true)}>
                <Info size={17} aria-hidden="true" />
              </button>
              {infoOpen && <span className="credits-info-tooltip" id="credit-reservation-info" role="tooltip"><span>{t.transactionNote}</span></span>}
            </span>
          </div>
          {current.transactions.length === 0 ? <p className="catalog-status">{t.empty}</p>
            : <div className="credits-transactions-panel">
              <ul className="credits-transactions">{current.transactions.map(entry => <li key={entry.id}>
              <div className="credits-transaction-heading">
                <span className={`credits-kind credits-kind-${entry.kind}`}>{t.kinds[entry.kind]}</span>
                <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(language)}</time>
              </div>
              <dl className="credits-transaction-details"><div><dt>{t.balanceAfter}</dt><dd>{number(entry.balanceAfter)}</dd></div><div><dt>{t.reservedAfter}</dt><dd>{number(entry.reservedAfter)}</dd></div></dl>
              <strong className={`credits-amount credits-amount-${entry.kind}`}>{["grant", "welcome", "purchase", "plan_bonus", "restore"].includes(entry.kind) ? "+" : ["capture", "unlock", "refund"].includes(entry.kind) ? "−" : ""}{number(entry.amount)} <span>{t.unit}</span></strong>
            </li>)}</ul></div>}
          <nav className="credits-pagination" aria-label={t.transactions}>
            <button className="button credits-secondary" disabled={loading || current.page === 1} onClick={() => refresh(current.page - 1)}>{t.previous}</button>
            <span aria-live="polite">{t.page} {number(current.page)}</span>
            <button className="button credits-secondary" disabled={loading || current.nextPage === null} onClick={() => current.nextPage !== null && refresh(current.nextPage)}>{t.next}</button>
          </nav>
        </section>
      </div>}
  </>;
}
