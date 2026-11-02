"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { clockText, pbtRequest, PbtError, remainingSeconds, type Attempt } from "@/lib/pbt-api";
import { pbtContent, pbtErrorMessage } from "@/lib/pbt-content";
import SiteHeader from "../SiteHeader";
import PbtQuestion, { ListeningPlayer, QuestionMaterial } from "./PbtQuestion";

export default function PbtAttempt({ id, review = false }: { id: string; review?: boolean }) {
  const { language, user, status } = useApp();
  const t = pbtContent[language];
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [position, setPosition] = useState(1);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [wrongOnly, setWrongOnly] = useState(false);
  const receivedAt = useRef(0);
  const autoSubmitted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const retry = () => setRevision(n => n + 1);

  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    setAttempt(null); setError(null);
    void pbtRequest<Attempt>(`attempts/${id}/${review ? "result/" : ""}`).then(data => {
      if (!active) return;
      if (!review && data.status === "submitted") { router.replace(`/pbt/attempts/${id}/result`); return; }
      receivedAt.current = performance.now();
      autoSubmitted.current = false;
      setRemaining(remainingSeconds(data, 0)); setAttempt(data);
    }).catch(cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [id, review, revision, status, user?.id, router]);

  useEffect(() => {
    if (!attempt || review) return;
    const update = () => setRemaining(remainingSeconds(attempt, performance.now() - receivedAt.current));
    const timer = window.setInterval(update, 500);
    const onVisible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [attempt, review]);

  useEffect(() => {
    if (!busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy]);

  useEffect(() => {
    if (confirm) dialogRef.current?.showModal();
    else dialogRef.current?.close();
  }, [confirm]);

  const submit = useCallback(async () => {
    if (submittingRef.current || busyRef.current) return;
    submittingRef.current = true; setSubmitting(true); setSubmitError(false); setConfirm(false);
    try {
      await pbtRequest<Attempt>(`attempts/${id}/submit/`, "POST", {});
      router.replace(`/pbt/attempts/${id}/result`);
    } catch { setSubmitError(true); submittingRef.current = false; setSubmitting(false); }
  }, [id, router]);

  useEffect(() => {
    if (remaining !== 0 || review || !attempt || busy || autoSubmitted.current) return;
    autoSubmitted.current = true;
    void submit();
  }, [remaining, review, attempt, busy, submit]);

  async function answer(itemPosition: number, option: number | null) {
    if (!attempt || busyRef.current || submittingRef.current || remaining === 0) return;
    const old = attempt.items.find(item => item.position === itemPosition)?.selectedOption ?? null;
    busyRef.current = true; setBusy(true); setSaveError(false);
    setAttempt(current => current ? { ...current, items: current.items.map(item => item.position === itemPosition ? { ...item, selectedOption: option } : item) } : current);
    try {
      await pbtRequest(`attempts/${id}/answers/${itemPosition}/`, "PUT", { selectedOption: option });
    } catch (cause) {
      if (cause instanceof PbtError && cause.code === "attempt_closed") router.replace(`/pbt/attempts/${id}/result`);
      else {
        setSaveError(true);
        setAttempt(current => current ? { ...current, items: current.items.map(item => item.position === itemPosition ? { ...item, selectedOption: old } : item) } : current);
      }
    } finally { busyRef.current = false; setBusy(false); }
  }

  const current = attempt?.items.find(item => item.position === position) ?? attempt?.items[0];
  const group = current && attempt ? (current.itemType.startsWith("paired_") ? attempt.items.filter(item => item.itemType === current.itemType) : [current]) : [];
  const grouped = group.length > 1;
  const first = group[0];
  const last = group.at(-1);
  const answered = attempt?.items.filter(item => item.selectedOption !== null).length ?? 0;
  const wrong = attempt?.items.filter(item => !item.isCorrect) ?? [];
  const disabled = busy || submitting || remaining === 0;
  const go = (next: number) => { setPosition(next); window.scrollTo({ top: 0, behavior: "instant" }); };

  return <><SiteHeader /><main id="main-content" className="pbt-workspace" tabIndex={-1}>
    <div className="page-container">
      <Link className="text-link pbt-back" href="/pbt" onClick={event => { if (busy || submitting) event.preventDefault(); }}>← {t.back}</Link>
      {error ? <div className="pbt-alert" role="alert">{pbtErrorMessage(error, t)} <button onClick={retry}>{t.retry}</button></div> : !attempt ? <p role="status">{t.loading}</p> : <>
        {review ? <section className="pbt-result-summary">
          <div><p className="eyebrow">{attempt.title} · {t[attempt.section]} · {t[attempt.mode]}</p><h1>{t.complete}</h1>{attempt.timedOut && <p>{t.timedOut}</p>}</div>
          <div className="pbt-score"><span>{t.score}</span><strong>{attempt.score}<small> / 100</small></strong><span>{t.correct} {attempt.items.length - wrong.length} / 50</span></div>
        </section> : <>
          <div className="pbt-test-heading"><div><p className="eyebrow">{attempt.title} · {t[attempt.mode]}</p><h1>{t[attempt.section]}</h1></div>
            <div className={`pbt-timer ${remaining !== null && remaining < 300 ? "is-urgent" : ""}`} role="timer" aria-label={remaining === null ? t.unlimited : `${remaining} seconds`}>{remaining === null ? <><span>∞</span><small>{t.unlimited}</small></> : clockText(remaining)}</div>
          </div>
          <p className="pbt-muted">{attempt.mode === "timed" ? t.timeHint : t.saveHint}</p>
          <div className="pbt-progress"><span>{t.answered} <strong>{answered} / 50</strong></span><span role="status">{busy ? t.saving : saveError ? t.saveFailed : t.saved}</span><progress max={50} value={answered} /></div>
          {saveError && <p role="alert" className="pbt-alert">{t.saveFailed}</p>}
          {remaining === 0 && <p role="status" className="pbt-alert">{t.expired}</p>}
          {submitError && <div role="alert" className="pbt-alert">{t.submitFailed} <button onClick={() => void submit()}>{t.retry}</button></div>}
        </>}
        {review ? <section className="pbt-review"><div className="pbt-review-heading"><h2>{t.review}</h2><div className="pbt-section-tabs">
          <button aria-pressed={!wrongOnly} onClick={() => setWrongOnly(false)}>{t.all}</button><button aria-pressed={wrongOnly} onClick={() => setWrongOnly(true)}>{t.wrongOnly} ({wrong.length})</button>
        </div></div>
          {(wrongOnly ? wrong : attempt.items).map(item => <div className="pbt-review-item" key={item.position}>
            {item.audioUrl && <ListeningPlayer url={item.audioUrl} />}
            <PbtQuestion question={item} review />
          </div>)}
          {wrongOnly && !wrong.length && <p>{t.noWrong}</p>}
        </section> : first && last && <div className="pbt-test-layout">
          <div className="pbt-test-paper">
            {first.audioUrl && <ListeningPlayer key={first.audioUrl} url={first.audioUrl} />}
            {grouped && first.passage && <section className="pbt-shared"><p>{first.position}–{last.position} · {t.group}</p><QuestionMaterial question={{ ...first, highlight: group.map(item => item.highlight).find(Boolean) || "" }} /></section>}
            {group.map(item => <PbtQuestion key={item.position} question={item} shared={grouped && !!first.passage} disabled={disabled} onAnswer={(p, o) => void answer(p, o)} />)}
            <div className="pbt-test-navigation"><button className="button pbt-secondary" disabled={first.position <= 1 || busy} onClick={() => go(first.position - 1)}>← {t.previous}</button>
              <span>{first.position}{grouped ? `–${last.position}` : ""} / 50</span>
              <button className="button pbt-secondary" disabled={last.position >= 50 || busy} onClick={() => go(last.position + 1)}>{t.next} →</button></div>
          </div>
          <aside className="pbt-answer-sheet"><h2>{t.navigator}</h2><div className="pbt-number-grid">
            {attempt.items.map(item => <button key={item.position} className={item.selectedOption !== null ? "is-answered" : ""} aria-current={group.some(q => q.position === item.position) ? "step" : undefined} aria-label={`${item.position}: ${item.selectedOption ?? t.noAnswer}`} disabled={busy} onClick={() => go(item.position)}>{item.position}</button>)}
          </div><p>{t.answered} {answered} / 50</p><button className="button button-primary" disabled={disabled} onClick={() => setConfirm(true)}>{submitting ? t.submitting : t.submit}</button><small>{t.saveHint}</small></aside>
        </div>}
      </>}
    </div>
    <dialog ref={dialogRef} className="pbt-dialog" onCancel={() => setConfirm(false)} aria-labelledby="pbt-confirm-title">
      <h2 id="pbt-confirm-title">{t.confirm}</h2><p>{t.unanswered}: {50 - answered}</p>
      <div><button className="button pbt-secondary" onClick={() => setConfirm(false)}>{t.cancel}</button><button className="button button-primary" onClick={() => void submit()} disabled={busy || submitting}>{t.submit}</button></div>
    </dialog>
  </main></>;
}
