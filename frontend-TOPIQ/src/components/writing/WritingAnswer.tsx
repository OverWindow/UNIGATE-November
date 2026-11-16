"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/app/providers";
import { creditsRequest, submitWriting, writingRequest, WritingError, type CreditBalance, type Evaluation, type EvaluationConfig, type LearnerAnswer, type Submission } from "@/lib/writing-api";
import { answerLength, evaluationContent } from "@/lib/writing-evaluation-content";
import WritingResult from "./WritingResult";

const rejected = new Set(["insufficient_credits", "price_changed", "evaluation_busy", "rate_limited", "invalid_submission", "evaluation_unavailable", "question_unavailable", "not_found", "authentication_required", "csrf_failed"]);

export default function WritingAnswer({ setId, slot, draft, onChange }: { setId: string; slot: number; draft: LearnerAnswer; onChange: (answer: LearnerAnswer) => void }) {
  const { language, user, refreshSession } = useApp();
  const t = evaluationContent[language];
  const [config, setConfig] = useState<EvaluationConfig | null>(null);
  const [balance, setBalance] = useState<CreditBalance | null>(null);
  const [entry, setEntry] = useState<Evaluation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<Submission | null>(null);
  const trackedId = useRef<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const storageKey = `topiq-writing:${user?.id}:${setId}:${slot}`;

  function remember(id: string | null) {
    trackedId.current = id;
    try { if (id) sessionStorage.setItem(storageKey, id); else sessionStorage.removeItem(storageKey); } catch { /* Storage may be unavailable. */ }
  }

  async function refresh(signal: AbortSignal) {
    const [nextConfig, nextBalance] = await Promise.all([
      writingRequest<EvaluationConfig>("evaluation-config/", signal), creditsRequest<CreditBalance>("", signal),
    ]);
    if (!signal.aborted) { setConfig(nextConfig); setBalance(nextBalance); }
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

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!config || busy) return;
    const answer = slot < 53 ? { a: draft.a ?? "", b: draft.b ?? "" } : { text: draft.text ?? "" };
    const submission = pending.current ?? { id: trackedId.current ?? crypto.randomUUID(), setId, typeSlot: slot, answer, priceVersion: config.priceVersion };
    pending.current = submission;
    remember(submission.id);
    operation.current?.abort();
    const controller = new AbortController(); operation.current = controller;
    setBusy(true); setError(""); setEntry(null);
    try {
      const result = await submitWriting(submission, controller.signal, config.timeoutSeconds);
      if (!controller.signal.aborted) accept(result);
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof WritingError && rejected.has(cause.code)) {
        pending.current = null; remember(null); setUncertain(false); setError(cause.code);
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
  const limit = slot < 53 ? 2000 : 20000;
  const cost = config?.prices[slot];
  const enabled = config?.enabled && cost !== null && cost !== undefined;
  const isEmpty = keys.every(key => !(draft[key] ?? "").trim());
  const tooLong = keys.some(key => Array.from(draft[key] ?? "").length > limit);
  const processing = entry?.status === "processing";
  return <section className="writing-answer" aria-label={t.answer}>
    <div className="writing-answer-heading"><h2>{t.answer}</h2><Link href="/writing/history">{t.history}</Link></div>
    <p>{balance ? `${t.available}: ${balance.available} · ${t.reserved}: ${balance.reserved} ${t.credits}` : t.loading}</p>
    <form onSubmit={event => void send(event)}>
      {keys.map(key => <label className="writing-answer-field" key={key}>
        <span>{key === "a" ? "㉠" : key === "b" ? "㉡" : t.answer}</span>
        <textarea lang="ko" value={draft[key] ?? ""} rows={slot < 53 ? 3 : 12} disabled={busy || processing || (uncertain && pending.current !== null)}
          onChange={event => onChange({ ...draft, [key]: event.target.value })} aria-describedby={`writing-count-${slot}-${key}`} />
        <span id={`writing-count-${slot}-${key}`} className="writing-count">{answerLength(draft[key] ?? "")} · {t.count} ({Array.from(draft[key] ?? "").length}/{limit})</span>
      </label>)}
      {tooLong && <p role="alert">{t.errors.invalid_submission}</p>}
      <p>{enabled ? `${t.cost}: ${isEmpty ? 0 : cost} ${t.credits}` : t.unavailable}</p>
      <p className="writing-notice">{t.blankFree}</p>
      <button className="button button-primary" type="submit" disabled={!enabled || !balance || busy || processing || tooLong || (!isEmpty && balance.available < (cost ?? 0) && !uncertain)}>
        {busy ? t.processing : uncertain ? t.retrySame : t.evaluate}
      </button>
    </form>
    {error && <p role="alert">{t.errors[error] ?? t.errors.default}</p>}
    {uncertain && <div role="status"><p>{t.uncertain}</p><button type="button" className="button writing-secondary" disabled={busy} onClick={() => {
      const controller = new AbortController(); operation.current = controller;
      void check(controller.signal).then(() => refresh(controller.signal)).catch(() => {});
    }}>{t.check}</button></div>}
    {entry && <WritingResult entry={entry} />}
  </section>;
}
