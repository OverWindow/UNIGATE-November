"use client";

import Link from "next/link";
import useRouter from "@/lib/use-navigation-router";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { writingRequest, WritingError, type Evaluation, type WritingSet } from "@/lib/writing/writing-api";
import { evaluationContent } from "@/lib/writing/writing-evaluation-content";
import { writingContent } from "@/lib/writing/writing-content";
import WritingResultModal from "./WritingResultModal";

export default function WritingHistory({ id }: { id?: string }) {
  const router = useRouter();
  const { language, refreshSession } = useApp();
  const t = evaluationContent[language];
  const w = writingContent[language];
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [entries, setEntries] = useState<{ evaluations: Evaluation[]; nextPage: number | null } | null>(null);
  const [detail, setDetail] = useState<Evaluation | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(id ?? null);
  const [detailError, setDetailError] = useState("");
  const [detailRevision, setDetailRevision] = useState(0);
  const resultTrigger = useRef<HTMLAnchorElement | null>(null);
  const [setNumbers, setSetNumbers] = useState<Record<string, number>>({});
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    void writingRequest<{ sets: WritingSet[] }>("sets/", controller.signal).then(result => {
      if (!controller.signal.aborted) setSetNumbers(Object.fromEntries(result.sets.map(set => [set.id, set.number])));
    }).catch(cause => {
      // Saved evaluations remain readable if the source sets are unavailable.
      if (!controller.signal.aborted && cause instanceof WritingError && cause.status === 401) void refreshSession();
    });
    return () => controller.abort();
  }, [revision, refreshSession]);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setError(""); setEntries(null);
    async function load() {
      try {
        const history = await writingRequest<{ evaluations: Evaluation[]; nextPage: number | null }>(`evaluations/?page=${page}`, controller.signal);
        if (controller.signal.aborted) return;
        setEntries(history);
        if (history.evaluations.some(entry => entry.status === "processing")) timer = setTimeout(() => void load(), 5000);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof WritingError ? cause.code : "default");
          if (cause instanceof WritingError && cause.status === 401) void refreshSession();
        }
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [page, revision, refreshSession]);

  useEffect(() => {
    setDetail(null); setDetailError("");
    if (!selectedId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const entry = await writingRequest<Evaluation>(`evaluations/${selectedId}/`, controller.signal);
        if (controller.signal.aborted) return;
        setDetail(entry);
        if (entry.status === "processing") timer = setTimeout(() => void load(), 3000);
      } catch (cause) {
        if (controller.signal.aborted) return;
        setDetailError(cause instanceof WritingError ? cause.code : "default");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    }
    void load();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [selectedId, detailRevision, refreshSession]);

  function closeResult() {
    setSelectedId(null);
    setDetail(null);
    if (id) router.replace("/writing/history", { scroll: false });
  }

  const date = (value: string) => new Date(value).toLocaleString(language);
  const questionLabel = (entry: Evaluation) => `${w.set} ${setNumbers[entry.setId] ?? "—"} · ${w.question} ${entry.typeSlot}`;
  return <div className="page-container writing-study writing-history">
    {id && <nav className="writing-pager"><Link href="/writing/history">{t.history}</Link></nav>}
    <h1>{t.history}</h1>
    {error && <div role="alert"><p>{t.errors[error] ?? t.errors.default}</p><button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.check}</button></div>}
    {!error && !entries && <p role="status">{t.loading}</p>}
    {entries && <>
      {entries.evaluations.length === 0 ? <p>{t.empty}</p> : <ul className="writing-history-list">{entries.evaluations.map(entry => <li key={entry.id}>
        <Link href={`/writing/history/${entry.id}`} prefetch={false} data-navigation-overlay="off"
          onClick={event => { resultTrigger.current = event.currentTarget; }}
          onNavigate={event => { event.preventDefault(); setDetail(null); setDetailError(""); setSelectedId(entry.id); }}>
          <strong className="writing-history-question">{questionLabel(entry)}</strong>
          <span>{entry.status === "processing" ? t.processingShort : t[entry.status]}</span>
          <span className="writing-history-score" title={t.totalScore}>{entry.totalScore !== null ? `${entry.totalScore} / ${entry.maxScore} ${t.points}` : "—"}</span>
          <time className="writing-history-date" dateTime={entry.createdAt}>{date(entry.createdAt)}</time>
        </Link>
      </li>)}</ul>}
      <div className="writing-pager"><button className="button writing-secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>{t.previous}</button>
        <span>{page}</span><button className="button writing-secondary" disabled={!entries.nextPage} onClick={() => setPage(entries.nextPage!)}>{t.next}</button></div>
    </>}
    {selectedId && <WritingResultModal key={selectedId} entry={detail} setNumber={detail ? setNumbers[detail.setId] : undefined}
      error={detailError ? t.errors[detailError] ?? t.errors.default : undefined} onRetry={() => setDetailRevision(value => value + 1)}
      onClose={closeResult} returnFocusRef={resultTrigger} />}
  </div>;
}
