"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { WritingError, writingRequest, type WritingDetail } from "@/lib/writing-api";
import { writingContent } from "@/lib/writing-content";
import WritingMaterial from "./WritingMaterial";

export default function WritingStudy({ id }: { id: string }) {
  const { language } = useApp();
  const t = writingContent[language];
  const [data, setData] = useState<WritingDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [index, setIndex] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef(false);

  useEffect(() => {
    setData(null); setError(null); setIndex(0);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      setError(new WritingError(404));
      return;
    }
    const controller = new AbortController();
    void writingRequest<WritingDetail>(`sets/${id}/`, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause); });
    return () => controller.abort();
  }, [id, revision]);

  useEffect(() => {
    if (pendingFocus.current) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
      pendingFocus.current = false;
    }
  }, [index]);

  function move(next: number) {
    if (next === index || !data || next < 0 || next >= data.questions.length) return;
    pendingFocus.current = true;
    setIndex(next);
  }

  const question = data?.questions[index];
  return <div className="page-container writing-study">
    {error ? <div className="writing-status" role="alert">
      <p>{error instanceof WritingError && error.status === 404 ? t.notFound : t.error}</p>
      <button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
    </div> : !data || !question ? <p className="writing-status" role="status">{t.loading}</p> : <>
      <div className="writing-study-heading"><h1>{t.set} {data.number}</h1><p>{t.questions}</p></div>
      <nav className="writing-question-nav" aria-label={t.navigation}>
        {data.questions.map((entry, position) => <button type="button" key={entry.number}
          aria-current={position === index ? "step" : undefined} onClick={() => move(position)}>
          <strong>{entry.number}</strong><span>{t.types[entry.number]}</span>
        </button>)}
      </nav>
      <article className="writing-question" aria-labelledby="writing-question-heading">
        <div className="writing-question-top"><span className="writing-badge">{t.types[question.number]}</span><span>{index + 1} / {data.questionCount}</span></div>
        <h2 id="writing-question-heading" ref={heading} tabIndex={-1}>{t.question} {question.number}</h2>
        <div lang="ko">
          <p className="writing-instruction">{question.instruction}</p>
          {question.passage && <div className="writing-passage">
            {question.contextTitle && <h3>{question.contextTitle}</h3>}
            <p>{question.passage}</p>
          </div>}
          {question.materials.length > 0 && <div className="writing-materials">{question.materials.map((material, position) =>
            <WritingMaterial key={`${question.number}-${position}`} material={material} language={language} />)}</div>}
          {question.materialNotes.length > 0 && <ul className="writing-notes">{question.materialNotes.map((note, position) => <li key={position}>{note}</li>)}</ul>}
          {question.dataSource && <p className="writing-source"><span lang={language}>{t.source}: </span>{question.dataSource}</p>}
          {question.requirements.length > 0 && <ul className="writing-requirements">{question.requirements.map((requirement, position) => <li key={position}>{requirement}</li>)}</ul>}
        </div>
      </article>
      <div className="writing-pager">
        <button className="button writing-secondary" disabled={index === 0} onClick={() => move(index - 1)}><ArrowLeft size={16} aria-hidden="true" />{t.previous}</button>
        {index < data.questions.length - 1 && <button className="button button-primary" onClick={() => move(index + 1)}>{t.next}<ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
      <p className="writing-notice">{t.notice}</p>
    </>}
  </div>;
}
