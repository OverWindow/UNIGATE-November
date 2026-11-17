"use client";

import Link from "next/link";
import { ArrowRight, Check, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { writingRequest, WritingError, type WritingSet } from "@/lib/writing-api";
import { writingContent } from "@/lib/writing-content";

export default function WritingCatalog() {
  const { language, refreshSession } = useApp();
  const t = writingContent[language];
  const c = t.catalog;
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
    <section className="writing-hero" aria-labelledby="writing-title"><div className="page-container writing-hero-heading">
      <div className="writing-hero-copy">
        <h1 id="writing-title">{t.title}</h1>
        <p className="writing-hero-description">{t.intro}</p>
      </div>
      <Link className="writing-history-link" href="/writing/history">{c.history}<ArrowRight size={16} aria-hidden="true" /></Link>
    </div></section>
    <div className="writing-flow"><ol className="page-container" aria-label={c.stepsLabel}>
      {c.steps.map((step, index) => <li key={step}>
        <span className="writing-step-number" aria-hidden="true">0{index + 1}</span><span>{step}</span>
        {index < c.steps.length - 1 && <ArrowRight size={16} aria-hidden="true" />}
      </li>)}
    </ol></div>
    <div className="page-container writing-catalog">
      <section id="writing-sets" tabIndex={-1} aria-label={t.back}>
        {error ? <div className="writing-status" role="alert"><p>{t.error}</p>
          <button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
        </div> : sets === null ? <p className="writing-status" role="status">{t.loading}</p>
          : sets.length === 0 ? <p className="writing-status">{t.empty}</p>
            : <div className="writing-set-grid">{sets.map(set => {
              const submitted = set.submittedSlots ?? [];
              return <Link className="writing-set-card" href={`/writing/sets/${set.id}`} key={set.id}>
                <div className="writing-card-top"><span className="writing-set-number" aria-hidden="true">{String(set.number).padStart(2, "0")}</span><span className="writing-badge">PBT</span></div>
                <h2>{t.set} {set.number}</h2><p>{t.questions}</p>
                <ul className="writing-set-outline" aria-label={t.submissionHistory}>
                  {[51, 52, 53, 54].map(slot => <li key={slot}
                    className={submitted.includes(slot) ? "is-submitted" : undefined}
                    aria-label={`${slot} · ${t.types[slot]} · ${submitted.includes(slot) ? t.submitted : t.notSubmitted}`}>
                    <span className="writing-outline-number">{slot}</span><span>{t.types[slot]}</span>
                    <span className="writing-outline-status" title={submitted.includes(slot) ? t.submitted : t.notSubmitted} aria-hidden="true">
                      {submitted.includes(slot) && <Check size={13} />}
                    </span>
                  </li>)}
                </ul>
                <span className="writing-set-action">{t.open}<ArrowRight size={17} aria-hidden="true" /></span>
              </Link>;
            })}</div>}
      </section>
      <div className="writing-catalog-notice"><Info size={16} aria-hidden="true" /><p className="writing-notice">{t.notice}</p></div>
    </div>
  </>;
}
