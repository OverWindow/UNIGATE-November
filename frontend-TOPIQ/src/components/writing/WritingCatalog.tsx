"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { writingRequest, WritingError, type WritingSet } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import { writingContent } from "@/lib/writing-content";

export default function WritingCatalog() {
  const { language, refreshSession } = useApp();
  const t = writingContent[language];
  const [sets, setSets] = useState<WritingSet[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setSets(null); setError(false);
    void writingRequest<{ sets: WritingSet[] }>("sets/", controller.signal).then(result => {
      if (!controller.signal.aborted) setSets(result.sets);
    }).catch(cause => { if (!controller.signal.aborted) {
      setError(true);
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
    } });
    return () => controller.abort();
  }, [revision, refreshSession]);

  return <>
    <section className="writing-hero"><div className="page-container">
      <h1>{t.title}</h1><p>{t.intro}</p>
    </div></section>
    <div className="page-container writing-catalog">
      <p className="writing-notice">{t.notice}</p>
      <p><Link className="button writing-secondary" href="/writing/history">{evaluationContent[language].history}</Link></p>
      {error ? <div className="writing-status" role="alert"><p>{t.error}</p>
        <button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
      </div> : sets === null ? <p className="writing-status" role="status">{t.loading}</p>
        : sets.length === 0 ? <p className="writing-status">{t.empty}</p>
          : <div className="writing-set-grid">{sets.map(set => <Link className="writing-set-card" href={`/writing/sets/${set.id}`} key={set.id}>
            <div className="writing-card-top"><span className="writing-set-number">{String(set.number).padStart(2, "0")}</span><span className="writing-badge">PBT</span></div>
            <h2>{t.set} {set.number}</h2><p>{t.questions}</p>
            <span className="writing-set-action">{t.open}<ArrowRight size={17} aria-hidden="true" /></span>
          </Link>)}</div>}
    </div>
  </>;
}
