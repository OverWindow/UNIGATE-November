"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth-content";
import { creditsContent } from "@/lib/credits-content";
import { creditsRequest, WritingError, type CreditBalance, type CreditEntry } from "@/lib/writing-api";

export default function CreditsAccount() {
  const { user, status, language, refreshSession } = useApp();
  const t = creditsContent[language];
  const a = authContent[language];
  return <div className="page-container credits-page">
    <div className="credits-heading"><h1>{t.title}</h1><p>{t.description}</p></div>
    {status === "loading" ? <p className="credits-status" role="status">{a.loading}</p>
      : status === "error" ? <div className="credits-status" role="alert"><p>{a.network}</p><button className="button credits-secondary" onClick={() => void refreshSession()}>{a.retry}</button></div>
      : status !== "authenticated" || !user ? <div className="credits-status"><p>{t.loginRequired}</p><Link className="button button-primary" href="/login?next=%2Fcredits">{a.login}</Link></div>
      : <CreditWallet key={user.id} />}
  </div>;
}

interface WalletData {
  page: number;
  balance: CreditBalance;
  transactions: CreditEntry[];
  nextPage: number | null;
}

function CreditWallet() {
  const { language, refreshSession, refreshCredits } = useApp();
  const t = creditsContent[language];
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<WalletData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(false);
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
      }
    }
    void load();
    return () => controller.abort();
  }, [page, revision, refreshSession, refreshCredits]);

  const current = data?.page === page ? data : null;
  const number = (value: number) => value.toLocaleString(language);
  const refresh = () => { setData(null); setError(false); setRevision(value => value + 1); };

  return <>
    <div className="credits-actions">
      <Link href="/writing/history">{t.history}</Link>
      <button className="button credits-secondary" disabled={!current && !error} onClick={refresh}>{t.refresh}</button>
    </div>
    {error ? <div className="credits-status" role="alert"><p>{t.error}</p><button className="button credits-secondary" onClick={refresh}>{t.retry}</button></div>
      : !current ? <p className="credits-status" role="status">{t.loading}</p>
      : <>
        <dl className="credits-balances">
          <div className="credits-available"><dt>{t.available}</dt><dd>{number(current.balance.available)} <span>{t.unit}</span></dd></div>
          <div><dt>{t.balance}</dt><dd>{number(current.balance.balance)} <span>{t.unit}</span></dd></div>
          <div><dt>{t.reserved}</dt><dd>{number(current.balance.reserved)} <span>{t.unit}</span></dd></div>
        </dl>
        <p className="credits-note">{t.balanceNote}</p>
        <section className="credits-history" aria-labelledby="credit-transactions-heading">
          <h2 id="credit-transactions-heading">{t.transactions}</h2>
          <p className="credits-note">{t.transactionNote}</p>
          {current.transactions.length === 0 ? <p className="credits-empty">{t.empty}</p>
            : <ul className="credits-transactions">{current.transactions.map(entry => <li key={entry.id}>
              <div className="credits-transaction-heading">
                <span className={`credits-kind credits-kind-${entry.kind}`}>{t.kinds[entry.kind]}</span>
                <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(language)}</time>
                <strong className={`credits-amount credits-amount-${entry.kind}`}>{entry.kind === "grant" ? "+" : entry.kind === "capture" ? "−" : ""}{number(entry.amount)} <span>{t.unit}</span></strong>
              </div>
              <div className="credits-transaction-details">
                <dl><div><dt>{t.balanceAfter}</dt><dd>{number(entry.balanceAfter)}</dd></div><div><dt>{t.reservedAfter}</dt><dd>{number(entry.reservedAfter)}</dd></div></dl>
                {entry.evaluationId && <Link href={`/writing/history/${entry.evaluationId}`}>{t.result}</Link>}
              </div>
            </li>)}</ul>}
          <nav className="credits-pagination" aria-label={t.transactions}>
            <button className="button credits-secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t.previous}</button>
            <span aria-live="polite">{t.page} {number(page)}</span>
            <button className="button credits-secondary" disabled={current.nextPage === null} onClick={() => current.nextPage !== null && setPage(current.nextPage)}>{t.next}</button>
          </nav>
        </section>
      </>}
  </>;
}
