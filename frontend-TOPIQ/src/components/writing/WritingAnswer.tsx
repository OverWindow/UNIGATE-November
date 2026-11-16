"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CircleAlert, X } from "lucide-react";
import { useApp } from "@/app/providers";
import { submitWriting, writingRequest, WritingError, type Evaluation, type EvaluationConfig, type LearnerAnswer, type Submission } from "@/lib/writing-api";
import { answerLength, evaluationContent } from "@/lib/writing-evaluation-content";
import WritingResult from "./WritingResult";

const rejected = new Set(["insufficient_credits", "price_changed", "evaluation_busy", "rate_limited", "invalid_submission", "evaluation_unavailable", "question_unavailable", "not_found", "authentication_required", "csrf_failed"]);

export default function WritingAnswer({ setId, slot, draft, onChange }: { setId: string; slot: number; draft: LearnerAnswer; onChange: (answer: LearnerAnswer) => void }) {
  const { language, user, refreshSession, creditBalance: balance, refreshCredits } = useApp();
  const t = evaluationContent[language];
  const [config, setConfig] = useState<EvaluationConfig | null>(null);
  const [entry, setEntry] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [creditNotice, setCreditNotice] = useState(0);
  const pending = useRef<Submission | null>(null);
  const trackedId = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const storageKey = `topiq-writing:${user?.id}:${setId}:${slot}`;

  function remember(id: string | null) {
    trackedId.current = id;
    try { if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
  }

  async function refresh(signal: AbortSignal) {
    const [nextConfig] = await Promise.all([
      writingRequest<EvaluationConfig>("evaluation-config/", signal), refreshCredits(signal),
    ]);
    if (!signal.aborted) setConfig(nextConfig);
  }

  function accept(result: Evaluation) {
    setEntry(result); setUncertain(false); setError("");
    if (result.status !== "processing") { pending.current = null; remember(null); }
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
    return () => { controller.abort(); operation.current?.abort(); };
    // This form is keyed by question and authenticated user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    if (entry?.status !== "processing") return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      await check(controller.signal);
      await refresh(controller.signal).catch(() => {});
      if (!controller.signal.aborted && trackedId.current) timer = setTimeout(() => void poll(), 3000);
    }
    timer = setTimeout(() => void poll(), 3000);
    return () => { clearTimeout(timer); controller.abort(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.status]);

  useEffect(() => {
    if (!creditNotice) return;
    const timer = setTimeout(() => setCreditNotice(0), 5000);
    return () => clearTimeout(timer);
  }, [creditNotice]);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!config || !enabled || !balance || busy || processing || isEmpty || tooLong) return;
    // A retry may refer to an evaluation whose credits are already reserved.
    if (balance.available < (cost ?? 0) && !uncertain) {
      setCreditNotice(value => value + 1);
      return;
    }
    const answer = slot < 53 ? { a: draft.a ?? "", b: draft.b ?? "" } : { text: draft.text ?? "" };
    const submission = pending.current ?? { id: trackedId.current ?? crypto.randomUUID(), setId, typeSlot: slot, answer, priceVersion: config.priceVersion };
    pending.current = submission;
    remember(submission.id);
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(""); setEntry(null); setCreditNotice(0);
    try {
      const result = await submitWriting(submission, controller.signal, config.timeoutSeconds);
      if (!controller.signal.aborted) accept(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof WritingError && rejected.has(cause.code)) {
        pending.current = null; remember(null); setUncertain(false);
        if (cause.code === "insufficient_credits") setCreditNotice(value => value + 1);
        else setError(cause.code);
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

  const keys: (keyof LearnerAnswer)[] = slot < 53 ? ["a", "b"] : ["text"];
  const limit = slot < 53 ? 200 : 1000;
  const cost = config?.prices[slot];
  const enabled = config?.enabled && cost !== null && cost !== undefined;
  const isEmpty = keys.every(key => !(draft[key] ?? "").trim());
  const tooLong = keys.some(key => Array.from(draft[key] ?? "").length > limit);
  const processing = entry?.status === "processing";
  return <section className="writing-answer" aria-label={t.answer}>
    <h2>{t.answer}</h2>
    <form onSubmit={event => void send(event)}>
      {keys.map(key => <label className={`writing-answer-field${slot < 53 ? " writing-answer-field-inline" : ""}`} key={key}>
        <span>{key === "a" ? "㉠" : key === "b" ? "㉡" : t.answer}</span>
        <textarea lang="ko" value={draft[key] ?? ""} rows={slot < 53 ? 1 : 12} maxLength={limit} disabled={busy || processing || (uncertain && pending.current !== null)}
          onChange={event => onChange({ ...draft, [key]: event.target.value })} aria-describedby={`writing-count-${slot}-${key}`} />
        <span id={`writing-count-${slot}-${key}`} className="writing-count">{answerLength(draft[key] ?? "")} · {t.count} ({Array.from(draft[key] ?? "").length}/{limit})</span>
      </label>)}
      {tooLong && <p role="alert">{t.errors.invalid_submission}</p>}
      {!enabled && <p>{t.unavailable}</p>}
      <div className="writing-answer-actions">
        <button className="button button-primary" type="submit" aria-busy={busy || processing} aria-describedby={enabled ? `writing-cost-${slot}` : undefined}
          disabled={!enabled || !balance || busy || processing || isEmpty || tooLong}>
          {(busy || processing) && <span className="writing-spinner" aria-hidden="true" />}
          {busy || processing ? t.processingShort : uncertain ? t.retrySame : t.evaluate}
        </button>
        {enabled && <span id={`writing-cost-${slot}`} className="writing-evaluation-cost">{cost} {t.credits}</span>}
      </div>
    </form>
    {busy && !entry && <p className="writing-evaluation-loading" role="status">{t.processing}</p>}
    {creditNotice > 0 && <div className="writing-credit-toast" key={creditNotice} role="alert">
      <CircleAlert size={20} aria-hidden="true" /><span>{t.errors.insufficient_credits}</span>
      <button type="button" aria-label={t.close} onClick={() => setCreditNotice(0)}><X size={18} aria-hidden="true" /></button>
    </div>}
    {error && <p role="alert">{t.errors[error] ?? t.errors.default}</p>}
    {uncertain && <div role="status"><p>{t.uncertain}</p><button type="button" className="button writing-secondary" disabled={busy} onClick={() => {
      const controller = new AbortController(); operation.current = controller;
      void check(controller.signal).then(() => refresh(controller.signal)).catch(() => {});
    }}>{t.check}</button></div>}
    {entry && <WritingResult entry={entry} />}
  </section>;
}
