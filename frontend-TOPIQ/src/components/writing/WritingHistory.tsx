"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { creditsRequest, writingRequest, WritingError, type CreditBalance, type CreditEntry, type Evaluation } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import { writingContent } from "@/lib/writing-content";
import WritingResult from "./WritingResult";

export default function WritingHistory({ id }: { id?: string }) {
  const { language, refreshSession, refreshCredits } = useApp();
  const t = evaluationContent[language];
  const [page, setPage] = useState(1);
  const [creditPage, setCreditPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [entries, setEntries] = useState<{ evaluations: Evaluation[]; nextPage: number | null } | null>(null);
  const [transactions, setTransactions] = useState<{ transactions: CreditEntry[]; nextPage: number | null } | null>(null);
  const [detail, setDetail] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setError(""); setDetail(null); setEntries(null); setTransactions(null);
    async function load() {
      try {
        const wallet = await refreshCredits(controller.signal);
        if (controller.signal.aborted) return;
        setBalance(wallet);
        if (id) {
          const entry = await writingRequest<Evaluation>(`evaluations/${id}/`, controller.signal);
          if (controller.signal.aborted) return;
          setDetail(entry);
          if (entry.status === "processing") timer = setTimeout(() => void load(), 3000);
        } else {
          const [history, credits] = await Promise.all([
            writingRequest<{ evaluations: Evaluation[]; nextPage: number | null }>(`evaluations/?page=${page}`, controller.signal),
            creditsRequest<{ transactions: CreditEntry[]; nextPage: number | null }>(`transactions/?page=${creditPage}`, controller.signal),
          ]);
          if (controller.signal.aborted) return;
          setEntries(history); setTransactions(credits);
          if (history.evaluations.some(entry => entry.status === "processing")) timer = setTimeout(() => void load(), 5000);
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof WritingError ? cause.code : "default");
          if (cause instanceof WritingError && cause.status === 401) void refreshSession();
        }
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [id, page, creditPage, revision, refreshSession, refreshCredits]);

  const date = (value: string) => new Date(value).toLocaleString(language);
  return <div className="page-container writing-study writing-history">
    <nav className="writing-pager"><Link href="/writing">{t.back}</Link>{id && <Link href="/writing/history">{t.history}</Link>}</nav>
    <h1>{t.history}</h1>
    {balance && <p className="writing-wallet">{t.available}: <strong>{balance.available}</strong> · {t.reserved}: {balance.reserved} {t.credits}</p>}
    {error && <div role="alert"><p>{t.errors[error] ?? t.errors.default}</p><button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.check}</button></div>}
    {!error && (id ? !detail : !entries) && <p role="status">{t.loading}</p>}
    {detail && <><p>{date(detail.createdAt)}</p><WritingResult entry={detail} showQuestion /></>}
    {entries && <>
      {entries.evaluations.length === 0 ? <p>{t.empty}</p> : <ul className="writing-history-list">{entries.evaluations.map(entry => <li key={entry.id}>
        <Link href={`/writing/history/${entry.id}`}><strong>{entry.typeSlot} · {t[entry.status]}</strong><span>{date(entry.createdAt)}</span>
          <span>{entry.totalScore !== null ? `${entry.totalScore} / ${entry.maxScore} · ` : ""}{t.charged}: {entry.chargedCredits}</span></Link>
      </li>)}</ul>}
      <div className="writing-pager"><button className="button writing-secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t.previous}</button>
        <span>{page}</span><button className="button writing-secondary" disabled={!entries.nextPage} onClick={() => setPage(entries.nextPage!)}>{t.next}</button></div>
    </>}
    {transactions && <section><h2>{t.transactions}</h2>
      {transactions.transactions.length === 0 ? <p>{t.empty}</p> : <ul className="writing-credit-list">{transactions.transactions.map(entry => <li key={entry.id}>
        <span>{date(entry.createdAt)}</span><strong>{t.kinds[entry.kind]} · {entry.amount}</strong>
        {entry.evaluationId && <Link href={`/writing/history/${entry.evaluationId}`}>{t.result}</Link>}
      </li>)}</ul>}
      <div className="writing-pager"><button className="button writing-secondary" disabled={creditPage === 1} onClick={() => setCreditPage(value => value - 1)}>{t.previous}</button>
        <span>{creditPage}</span><button className="button writing-secondary" disabled={!transactions.nextPage} onClick={() => setCreditPage(transactions.nextPage!)}>{t.next}</button></div>
    </section>}
    <p className="writing-notice">{writingContent[language].notice}</p>
  </div>;
}
