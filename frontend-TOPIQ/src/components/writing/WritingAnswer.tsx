"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/app/providers";
import { submitWriting, writingRequest, WritingError, type Evaluation, type EvaluationConfig, type EvaluationUsage, type WritingDetail, type LearnerAnswer, type Submission } from "@/lib/writing/writing-api";
import { answerLength, evaluationContent } from "@/lib/writing/writing-evaluation-content";
import WritingResultModal from "./WritingResultModal";
import ManuscriptEditor from "./ManuscriptEditor";

const rejected = new Set(["set_locked", "evaluation_limit_reached", "price_changed", "evaluation_busy", "rate_limited", "invalid_submission", "evaluation_unavailable", "question_unavailable", "not_found", "authentication_required", "csrf_failed"]);

export default function WritingAnswer({ setId, setNumber, slot, draft, initialUsage, onChange, onSubmitted }: {
  setId: string; setNumber: number; slot: number; draft: LearnerAnswer; onChange: (answer: LearnerAnswer) => void;
  onSubmitted: (slot: number) => void;
  initialUsage: EvaluationUsage;
}) {
  const { language, user, refreshSession } = useApp();
  const t = evaluationContent[language];
  const [config, setConfig] = useState<EvaluationConfig | null>(null);
  const [usage, setUsage] = useState(initialUsage);
  const [entry, setEntry] = useState<Evaluation | null>(null);
  const [resultOpen, setResultOpen] = useState(false);
  const resultTrigger = useRef<HTMLButtonElement>(null);
  const autoOpened = useRef<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [loginNotice, setLoginNotice] = useState(false);
  const [manuscript, setManuscript] = useState(false);
  const [composing, setComposing] = useState(false);
  const pending = useRef<Submission | null>(null);
  const trackedId = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const storageKey = `topiq-writing:${user?.id}:${setId}:${slot}`;

  function remember(id: string | null) {
    trackedId.current = id;
    try { if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
  }

  async function refresh(signal: AbortSignal) {
    const [nextConfig, detail] = await Promise.all([
      writingRequest<EvaluationConfig>("evaluation-config/", signal), writingRequest<WritingDetail>(`sets/${setId}/`, signal),
    ]);
    if (!signal.aborted) { setConfig(nextConfig); setUsage(detail.evaluationUsage[slot]); }
  }

  function accept(result: Evaluation) {
    setEntry(result); setUncertain(false); setError("");
    if (result.usage) setUsage(result.usage);
    onSubmitted(result.typeSlot);
    if (result.status !== "processing") { pending.current = null; remember(null); }
    if (result.status === "succeeded" && autoOpened.current !== result.id) {
      autoOpened.current = result.id;
      setResultOpen(true);
    }
  }

  async function check(signal: AbortSignal) {
    const id = trackedId.current;
    if (!id) return;
    try {
      const result = await writingRequest<Evaluation>(`evaluations/${id}/`, signal);
      if (!signal.aborted && trackedId.current === id) accept(result);
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      setUncertain(true);
    }
  }

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    operation.current = controller;
    try { trackedId.current = sessionStorage.getItem(storageKey); } catch { /* Storage may be unavailable. */ }
    if (trackedId.current) { setUncertain(true); void check(controller.signal); }
    void refresh(controller.signal).catch(cause => {
      if (!controller.signal.aborted) {
        setError(cause instanceof WritingError ? cause.code : "default");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    });
    const focusController = new AbortController();
    const refreshOnFocus = () => { void refresh(focusController.signal).catch(() => {}); };
    window.addEventListener("focus", refreshOnFocus);
    return () => { controller.abort(); focusController.abort(); operation.current?.abort(); window.removeEventListener("focus", refreshOnFocus); };
    // This form is keyed by question and authenticated user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (entry?.status !== "processing" && usage.pending === 0) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await check(controller.signal);
      await refresh(controller.signal).catch(() => {});
      if (!controller.signal.aborted && (trackedId.current || usage.pending > 0)) timer = setTimeout(() => void poll(), 3000);
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.status, usage.pending]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!user) {
      setLoginNotice(true);
      return;
    }
    if (!config || !enabled || busy || processing || isEmpty || tooLong || exhausted) return;
    const answer = slot < 53 ? { a: draft.a ?? "", b: draft.b ?? "" } : { text: draft.text ?? "" };
    const submission = pending.current ?? { id: trackedId.current ?? crypto.randomUUID(), setId, typeSlot: slot, answer,
      priceVersion: config.priceVersion, feedbackLanguage: language };
    pending.current = submission;
    remember(submission.id);
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(""); setEntry(null); setResultOpen(true);
    try {
      const result = await submitWriting(submission, controller.signal, config.timeoutSeconds);
      if (!controller.signal.aborted) accept(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof WritingError && rejected.has(cause.code)) {
        pending.current = null; remember(null); setUncertain(false);
        setResultOpen(false);
        setError(cause.code);
        if (cause.status === 401) void refreshSession();
      } else {
        setUncertain(true);
        await check(controller.signal);
      }
    } finally {
      if (!controller.signal.aborted) {
        setBusy(false);
        void refresh(controller.signal).catch(() => {});
      }
    }
  }

  function checkStatus() {
    const controller = new AbortController(); operation.current = controller;
    void check(controller.signal).then(() => refresh(controller.signal)).catch(() => {});
  }

  const keys: (keyof LearnerAnswer)[] = slot < 53 ? ["a", "b"] : ["text"];
  const limit = slot < 53 ? 100 : 1000;
  const enabled = config?.enabled;
  const limitReached = usage.used >= usage.limit;
  const exhausted = usage.remaining === 0 && !uncertain;
  const isEmpty = keys.every(key => !(draft[key] ?? "").trim());
  const tooLong = keys.some(key => Array.from(draft[key] ?? "").length > limit);
  const processing = entry?.status === "processing";
  return <section className="writing-answer" aria-label={t.answer}>
    <div className="writing-answer-heading">
      <h2>{t.answer}</h2>
      {slot >= 53 && <div className="writing-answer-format" role="group" aria-label={t.answerFormat} data-format={manuscript ? "manuscript" : "plain"}>
        <button type="button" aria-pressed={!manuscript} disabled={composing} onClick={() => setManuscript(false)}>{t.plainFormat}</button>
        <button type="button" aria-pressed={manuscript} disabled={composing} onClick={() => setManuscript(true)}>{t.manuscriptFormat}</button>
      </div>}
    </div>
    <form onSubmit={event => void send(event)}>
      {keys.map(key => <div className={`writing-answer-field${slot < 53 ? " writing-answer-field-inline" : ""}`} key={key}>
        {slot < 53 ? <>
          <label htmlFor={`writing-input-${slot}-${key}`}>{key === "a" ? "㉠" : "㉡"}</label>
          <textarea id={`writing-input-${slot}-${key}`} lang="ko" value={draft[key] ?? ""} rows={1} maxLength={limit}
            disabled={busy || processing || (uncertain && pending.current !== null)}
            onChange={event => onChange({ ...draft, [key]: event.target.value })} />
        </> : <ManuscriptEditor id={`writing-input-${slot}-${key}`} value={draft[key] ?? ""}
          onChange={value => onChange({ ...draft, [key]: value })} manuscript={manuscript}
          minimumCells={slot === 53 ? 300 : 700} maxLength={limit} label={t.answer}
          disabled={busy || processing || (uncertain && pending.current !== null)}
          describedBy={`writing-count-${slot}-${key}`} onComposingChange={setComposing} />}
        {slot >= 53 && <span id={`writing-count-${slot}-${key}`} className="writing-count">{answerLength(draft[key] ?? "")} · {t.count} ({Array.from(draft[key] ?? "").length}/{limit})</span>}
      </div>)}
      {tooLong && <p role="alert">{t.errors.invalid_submission}</p>}
      {user && !enabled && <p>{t.unavailable}</p>}
      <div className="writing-answer-actions">
        <button className="button button-primary" type="submit" aria-busy={busy || processing} aria-describedby={limitReached ? `writing-limit-${slot}` : undefined}
          disabled={!!user && (!enabled || busy || processing || isEmpty || tooLong || exhausted)}>
          {(busy || processing) && <span className="writing-spinner" aria-hidden="true" />}
          {busy || processing ? t.processingShort : uncertain ? t.retrySame : t.evaluate}
        </button>
      </div>
      {limitReached && <p id={`writing-limit-${slot}`} className="writing-notice" role="status">{t.errors.evaluation_limit_reached}</p>}
    </form>
    {loginNotice && !user && <div className="writing-login-notice" role="status">
      <p>{t.loginNotice}</p>
      <Link className="button button-primary" href={`/login?next=${encodeURIComponent(`/writing/sets/${setId}`)}`}>{t.login}</Link>
    </div>}
    {busy && !entry && <p className="writing-evaluation-loading" role="status">{t.processing}</p>}
    {error && !(limitReached && error === "evaluation_limit_reached") && <p role="alert">{t.errors[error] ?? t.errors.default}</p>}
    {uncertain && <div role="status"><p>{t.uncertain}</p><button type="button" className="button writing-secondary" disabled={busy} onClick={checkStatus}>{t.check}</button></div>}
    {entry && <div className="writing-result-launcher">
      <p role="status">{t[entry.status]}{entry.totalScore !== null && <strong>{entry.totalScore} / {entry.maxScore} {t.points}</strong>}</p>
      <button ref={resultTrigger} type="button" className="button writing-secondary" onClick={() => setResultOpen(true)}>{t.viewResult}</button>
    </div>}
    {resultOpen && <WritingResultModal entry={entry} setNumber={setNumber} evaluatingSlot={busy ? slot : undefined}
      error={uncertain && !busy ? t.uncertain : undefined} onRetry={checkStatus}
      returnFocusRef={resultTrigger} onClose={() => setResultOpen(false)} />}
  </section>;
}
