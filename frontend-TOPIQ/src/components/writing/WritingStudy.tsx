"use client";

import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { WritingError, writingRequest, unlockWriting, type WritingDetail, type LearnerAnswer, type EvaluationConfig } from "@/lib/writing-api";
import { writingContent } from "@/lib/writing-content";
import WritingAnswer from "./WritingAnswer";
import WritingQuestionContent from "./WritingQuestionContent";
import WritingQuestionPreview from "./WritingQuestionPreview";

export default function WritingStudy({ id }: { id: string }) {
  const { language, refreshSession, refreshCredits } = useApp();
  const t = writingContent[language];
  const [data, setData] = useState<WritingDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [config, setConfig] = useState<EvaluationConfig | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const unlockOperation = useRef<AbortController | null>(null);
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, LearnerAnswer>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const prompt = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);

  const markSubmitted = useCallback((slot: number) => {
    setData(previous => !previous || previous.submittedSlots?.includes(slot) ? previous : {
      ...previous, submittedSlots: [...(previous.submittedSlots ?? []), slot].sort((a, b) => a - b),
    });
  }, []);

  useEffect(() => () => unlockOperation.current?.abort(), [id]);

  async function openSet() {
    if (unlocking) return;
    const controller = new AbortController();
    unlockOperation.current = controller;
    setUnlocking(true); setUnlockError("");
    try {
      await unlockWriting(id, controller.signal);
      if (!controller.signal.aborted) setRevision(value => value + 1);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setUnlockError(cause instanceof WritingError ? cause.code : "unknown");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    } finally {
      if (!controller.signal.aborted) {
        setUnlocking(false);
        void refreshCredits(controller.signal).catch(() => {});
      }
    }
  }

  useEffect(() => {
    setData(null); setError(null); setIndex(0);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      setError(new WritingError(404));
      return;
    }
    const controller = new AbortController();
    void writingRequest<EvaluationConfig>("evaluation-config/", controller.signal).then(nextConfig => {
      if (!controller.signal.aborted) setConfig(nextConfig);
      return writingRequest<WritingDetail>(`sets/${id}/`, controller.signal);
    }).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(cause => { if (!controller.signal.aborted) {
      setError(cause);
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
    } });
    return () => controller.abort();
  }, [id, revision, refreshSession]);

  useEffect(() => {
    if (pendingFocus.current) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView({ block: "start", behavior: "instant" });
      pendingFocus.current = false;
    }
  }, [index]);

  function move(next: number, focusQuestion = false) {
    if (next === index || !data || next < 0 || next >= data.questions.length) return;
    pendingFocus.current = focusQuestion;
    setIndex(next);
  }

  const question = data?.questions[index];
  const submittedSlots = data?.submittedSlots ?? [];
  const locked = error instanceof WritingError && error.code === "set_locked";
  return <div className="page-container writing-study">
    {locked && config ? <section className="writing-status writing-unlock" aria-labelledby="writing-unlock-title">
      <h1 id="writing-unlock-title">{t.unlockTitle}</h1>
      <p>{t.unlockNote}</p>
      <ul>{[51, 52, 53, 54].map(slot => <li key={slot}>{t.priceBreakdown.replace("{number}", String(slot)).replace("{credits}", String(config.questionPrices[slot]))}</li>)}</ul>
      <button type="button" className="button button-primary" disabled={unlocking} aria-busy={unlocking} onClick={() => void openSet()}>
        {unlocking ? t.unlocking : t.unlock.replace("{credits}", String(config.setCost))}
      </button>
      {unlockError && <p role="alert">{unlockError === "insufficient_credits" ? t.insufficientCredits
        : unlockError === "not_found" ? t.notFound : unlockError === "question_unavailable" ? t.error : t.unlockError}</p>}
    </section> : error ? <div className="writing-status" role="alert">
      <p>{error instanceof WritingError && error.status === 404 ? t.notFound : t.error}</p>
      <button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
    </div> : !data || !question ? <p className="writing-status" role="status">{t.loading}</p> : <>
      <div className="writing-study-heading"><h1>{t.set} {data.number}</h1><p>{t.questions}</p></div>
      <nav className="writing-question-nav" aria-label={t.navigation} data-question={question.number}>
        {data.questions.map((entry, position) => <button type="button" key={entry.number}
          aria-label={`${entry.number} · ${t.types[entry.number]}${submittedSlots.includes(entry.number) ? ` · ${t.submitted}` : ""}`}
          aria-current={position === index ? "step" : undefined} onClick={() => move(position)}>
          <strong>{entry.number}{submittedSlots.includes(entry.number) && <span className="writing-tab-submitted" title={t.submitted}>
            <Check size={12} aria-hidden="true" />
          </span>}</strong><span>{t.types[entry.number]}</span>
        </button>)}
      </nav>
      <article className="writing-question" aria-labelledby="writing-question-heading">
        <div ref={prompt} className="writing-question-prompt">
          <div className="writing-question-top"><span className="writing-badge">{t.types[question.number]}</span><span>{index + 1} / {data.questionCount}</span></div>
          <h2 id="writing-question-heading" ref={heading} tabIndex={-1}>{t.question} {question.number}</h2>
          <WritingQuestionContent question={question} language={language} />
        </div>
        <WritingAnswer key={question.number} setId={id} setNumber={data.number} slot={question.number} draft={drafts[question.number] ?? {}}
          initialUsage={data.evaluationUsage[question.number]}
          onChange={answer => setDrafts(previous => ({ ...previous, [question.number]: answer }))} onSubmitted={markSubmitted} />
      </article>
      {(question.number === 53 || question.number === 54) && <WritingQuestionPreview key={`${id}-${question.number}`}
        question={question} language={language} promptRef={prompt} />}
      <div className="writing-pager">
        <button className="button writing-secondary" disabled={index === 0} onClick={() => move(index - 1, true)}><ArrowLeft size={16} aria-hidden="true" />{t.previous}</button>
        {index < data.questions.length - 1 && <button className="button button-primary" onClick={() => move(index + 1, true)}>{t.next}<ArrowRight size={16} aria-hidden="true" /></button>}
      </div>
      <p className="writing-notice">{t.notice}</p>
    </>}
  </div>;
}
