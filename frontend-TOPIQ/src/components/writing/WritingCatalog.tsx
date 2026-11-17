"use client";

import Link from "next/link";
import { ArrowRight, Check, Info, PencilLine, Sparkles } from "lucide-react";
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
    <section className="writing-hero" aria-labelledby="writing-title"><div className="page-container writing-hero-grid">
      <div className="writing-hero-copy">
        <p className="writing-eyebrow"><PencilLine size={16} aria-hidden="true" />{t.title}<span>TOPIK II · PBT</span></p>
        <h1 id="writing-title">{c.headline}<span>{c.headlineAccent}</span></h1>
        <p className="writing-hero-description">{t.intro}</p>
        <div className="writing-hero-actions">
          <a className="button button-primary" href="#writing-sets">{c.start}<ArrowRight size={18} aria-hidden="true" /></a>
          <Link className="writing-history-link" href="/writing/history">{c.history}<ArrowRight size={16} aria-hidden="true" /></Link>
        </div>
      </div>
      <figure className="writing-preview">
        <figcaption><span><Sparkles size={17} aria-hidden="true" />{c.exampleTitle}</span><span className="writing-preview-label">{c.exampleLabel}</span></figcaption>
        <div className="writing-preview-before">
          <span className="writing-preview-caption">{c.before}</span>
          <p lang="ko">한국어를 공부한 지 2년이 <del>됬습니다.</del></p>
        </div>
        <div className="writing-preview-after">
          <span className="writing-preview-caption"><Check size={14} aria-hidden="true" />{c.after}</span>
          <p lang="ko">한국어를 공부한 지 2년이 <ins>되었습니다.</ins></p>
        </div>
        <p className="writing-preview-note" lang="ko">‘됬습니다’는 ‘되었습니다’로 고쳐 써요.</p>
      </figure>
    </div></section>
    <div className="writing-flow"><ol className="page-container" aria-label={c.stepsLabel}>
      {c.steps.map((step, index) => <li key={step}>
        <span className="writing-step-number" aria-hidden="true">0{index + 1}</span><span>{step}</span>
        {index < c.steps.length - 1 && <ArrowRight size={16} aria-hidden="true" />}
      </li>)}
    </ol></div>
    <div className="page-container writing-catalog">
      <section aria-labelledby="writing-sets">
        <div className="writing-catalog-heading">
          <h2 id="writing-sets" tabIndex={-1}>{c.setsTitle}</h2><p>{c.setsIntro}</p>
        </div>
        {error ? <div className="writing-status" role="alert"><p>{t.error}</p>
          <button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
        </div> : sets === null ? <p className="writing-status" role="status">{t.loading}</p>
          : sets.length === 0 ? <p className="writing-status">{t.empty}</p>
            : <div className="writing-set-grid">{sets.map(set => {
              const submitted = set.submittedSlots ?? [];
              return <Link className="writing-set-card" href={`/writing/sets/${set.id}`} key={set.id}>
                <div className="writing-card-top"><span className="writing-set-number" aria-hidden="true">{String(set.number).padStart(2, "0")}</span><span className="writing-badge">PBT</span></div>
                <h3>{t.set} {set.number}</h3><p>{t.questions}</p>
                {submitted.length > 0 && <div className="writing-submission-history">
                  <span>{t.submissionHistory} <strong>{submitted.length}/{set.questionCount}</strong></span>
                  <ul aria-label={t.submissionHistory}>{[51, 52, 53, 54].map(slot => <li key={slot}
                    className={submitted.includes(slot) ? "is-submitted" : undefined}
                    aria-label={`${slot}: ${submitted.includes(slot) ? t.submitted : t.notSubmitted}`}>
                    {slot}{submitted.includes(slot) && <Check size={11} aria-hidden="true" />}
                  </li>)}</ul>
                </div>}
                <ul className="writing-set-outline">
                  <li><span>51·52</span>{c.sentenceCompletion}</li>
                  <li><span>53</span>{t.types[53]}</li>
                  <li><span>54</span>{t.types[54]}</li>
                </ul>
                <span className="writing-set-action">{t.open}<ArrowRight size={17} aria-hidden="true" /></span>
              </Link>;
            })}</div>}
      </section>
      <div className="writing-catalog-notice"><Info size={16} aria-hidden="true" /><p className="writing-notice">{t.notice}</p></div>
    </div>
  </>;
}
