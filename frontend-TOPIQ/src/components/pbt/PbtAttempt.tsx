"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { answerText, isAnswered, clockText, pbtRequest, PbtError, remainingSeconds, questionGroup, type Answer, type Attempt } from "@/lib/pbt-api";
import type { ExamFormat } from "@/lib/exam-content";
import { examCopy, pbtErrorMessage } from "@/lib/pbt-content";
import SiteHeader from "../SiteHeader";
import PbtQuestion, { QuestionMaterial } from "./PbtQuestion";
import ListeningPlayer, { type AudioProgress } from "./ListeningPlayer";
import ListeningSession from "./ListeningSession";
import { listeningCopy, readListeningCheckpoint } from "@/lib/listening";

export default function PbtAttempt({ id, review = false, examFormat = "pbt" }: { id: string; review?: boolean; examFormat?: ExamFormat }) {
  const basePath = `/${examFormat}`;
  const { language, user, status } = useApp();
  const t = examCopy(language, examFormat);
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [saveError, setSaveError] = useState(false);
  const [submitError, setSubmitError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [dialog, setDialog] = useState<"questions" | "submit" | null>(null);
  const [position, setPosition] = useState(1);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const [wrongOnly, setWrongOnly] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [listeningVolume, setListeningVolume] = useState(1);
  const [completedPosition, setCompletedPosition] = useState<number | null>(null);
  const completedPositionRef = useRef<number | null>(null);
  const completionHandled = useRef<number | null>(null);
  const completePassage = useCallback((finished: number) => {
    completedPositionRef.current = finished;
    setCompletedPosition(finished);
  }, []);
  const isListening = attempt?.section === "listening";
  const timedListening = isListening && attempt?.mode === "timed";
  const [audioProgress, setAudioProgress] = useState<AudioProgress | null>(null);
  const updateAudioProgress = useCallback((next: AudioProgress) => {
    setAudioProgress(current => current && current.playbackKey === next.playbackKey && current.elapsed === next.elapsed && current.duration === next.duration ? current : next);
  }, []);
  const receivedAt = useRef(0);
  const autoSubmitted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const dialogTitleRef = useRef<HTMLHeadingElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const retry = () => setRevision(n => n + 1);

  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    setAttempt(null); setError(null);
    void pbtRequest<Attempt>(`attempts/${id}/${review ? "result/" : ""}`, "GET", undefined, examFormat).then(data => {
      if (!active) return;
      if (!review && data.status === "submitted") { router.replace(`${basePath}/attempts/${id}/result`); return; }
      receivedAt.current = performance.now();
      autoSubmitted.current = false;
      completedPositionRef.current = null; completionHandled.current = null; setCompletedPosition(null);
      const listening = data.section === "listening";
      const saved = listening && data.mode === "timed" && !review ? readListeningCheckpoint(id, examFormat) : null;
      setPosition(saved && data.items.some(item => item.position === saved.position) ? saved.position : 1);
      setRemaining(listening ? null : remainingSeconds(data, 0)); setAttempt(data);
    }).catch(cause => {
      if (!active) return;
      if (review && cause instanceof PbtError && cause.code === "result_email_required") {
        router.replace(`${basePath}/attempts/${id}/feedback`); return;
      }
      setError(cause);
    });
    return () => { active = false; };
  }, [id, review, revision, status, user?.id, router, basePath, examFormat]);

  useEffect(() => {
    if (!attempt || review || isListening) return;
    const update = () => setRemaining(remainingSeconds(attempt, performance.now() - receivedAt.current));
    const timer = window.setInterval(update, 500);
    const onVisible = () => { if (document.visibilityState === "visible") update(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [attempt, review, isListening]);

  useEffect(() => {
    if (!busy) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [busy]);

  useEffect(() => {
    if (dialog) {
      if (!dialogRef.current?.open) dialogRef.current?.showModal();
      dialogTitleRef.current?.focus();
    } else dialogRef.current?.close();
  }, [dialog]);

  const submit = useCallback(async () => {
    if (submittingRef.current || busyRef.current) return;
    submittingRef.current = true; setSubmitting(true); setSubmitError(false); setDialog(null);
    try {
      await pbtRequest<Attempt>(`attempts/${id}/submit/`, "POST", {}, examFormat);
      router.replace(`${basePath}/attempts/${id}/result`);
    } catch { setSubmitError(true); submittingRef.current = false; setSubmitting(false); }
  }, [id, router, basePath, examFormat]);

  useEffect(() => {
    if (remaining !== 0 || review || !attempt || busy || autoSubmitted.current) return;
    autoSubmitted.current = true;
    void submit();
  }, [remaining, review, attempt, busy, submit]);

  async function answer(itemPosition: number, value: Answer) {
    if (!attempt || busyRef.current || submittingRef.current || remaining === 0 || (timedListening && completedPositionRef.current === first?.position)) return;
    const old = attempt.items.find(item => item.position === itemPosition);
    if (!old) return;
    busyRef.current = true; setBusy(true); setSaveError(false);
    setAttempt(current => current ? { ...current, items: current.items.map(item => item.position === itemPosition ? { ...item, ...value } : item) } : current);
    try {
      await pbtRequest(`attempts/${id}/answers/${itemPosition}/`, "PUT", value, examFormat);
    } catch (cause) {
      if (cause instanceof PbtError && cause.code === "attempt_closed") router.replace(`${basePath}/attempts/${id}/result`);
      else {
        setSaveError(true);
        setAttempt(current => current ? { ...current, items: current.items.map(item => item.position === itemPosition ? old : item) } : current);
      }
    } finally { busyRef.current = false; setBusy(false); }
  }

  const current = attempt?.items.find(item => item.position === position) ?? attempt?.items[0];
  const group = current && attempt ? questionGroup(attempt.items, current) : [];
  const grouped = group.length > 1;
  const first = group[0];
  const last = group.at(-1);
  const playbackKey = `${id}:${first?.position}`;
  const elapsedAudio = audioProgress?.playbackKey === playbackKey ? audioProgress.elapsed : 0;
  const audioDuration = audioProgress?.playbackKey === playbackKey ? audioProgress.duration : null;
  const audioTime = `${clockText(elapsedAudio)} / ${audioDuration === null ? "--:--" : clockText(audioDuration)}`;
  const sharedMaterial = grouped && !!(first?.passage || first?.materialUrl || first?.auxiliary);
  const total = attempt?.items.length ?? 0;
  const answered = attempt?.items.filter(isAnswered).length ?? 0;
  const wrong = attempt?.items.filter(item => !item.isCorrect) ?? [];
  const disabled = busy || submitting || remaining === 0 || (timedListening && completedPosition === first?.position);
  useEffect(() => {
    if (!timedListening || review || !first || !last || completedPosition !== first.position || busy || submitting || completionHandled.current === first.position) return;
    // Finish an in-flight answer save before moving or submitting.
    completionHandled.current = first.position;
    if (last.position >= total) { void submit(); return; }
    setPosition(last.position + 1);
    window.requestAnimationFrame(() => {
      paperRef.current?.scrollTo({ top: 0, behavior: "instant" });
      paperRef.current?.focus({ preventScroll: true });
    });
  }, [timedListening, review, first, last, total, completedPosition, busy, submitting, submit]);
  const go = (next: number) => {
    if (timedListening || busy || submitting || audioPlaying) return;
    setDialog(null); setPosition(next);
    window.requestAnimationFrame(() => {
      paperRef.current?.scrollTo({ top: 0, behavior: "instant" });
      paperRef.current?.focus({ preventScroll: true });
    });
  };

  const questions = first && last && <div className={sharedMaterial ? "pbt-group-layout" : undefined}>
    {sharedMaterial && <section className="pbt-shared"><p>{first.position}–{last.position} · {t.group}</p><QuestionMaterial question={{ ...first, highlight: group.map(item => item.highlight).find(Boolean) || "" }} /></section>}
    <div className="pbt-group-questions">
      {group.map(item => <PbtQuestion key={item.position} question={item} shared={sharedMaterial} disabled={disabled} onAnswer={(p, o) => void answer(p, o)} />)}
    </div>
  </div>;

  return <div className={!review && attempt ? "pbt-session" : undefined}><SiteHeader /><main id="main-content" className={`pbt-workspace${review ? "" : " pbt-exam"}`} tabIndex={-1}>
    <div className={review ? "page-container" : "pbt-exam-content"}>
      {(review || !attempt) && <div className={review ? undefined : "pbt-exam-width pbt-exam-loading"}>
        <Link className="text-link pbt-back" href={basePath}>← {t.back}</Link>
        {error ? <div className="pbt-alert" role="alert">{pbtErrorMessage(error, t)} <button onClick={retry}>{t.retry}</button></div> : !attempt && <p role="status">{t.loading}</p>}
      </div>}
      {attempt && <>
        {review ? <section className="pbt-result-summary">
          <div><p className="eyebrow">{attempt.title} · {t[attempt.section]} · {t[attempt.mode]}</p><h1>{t.complete}</h1>{attempt.timedOut && <p>{t.timedOut}</p>}</div>
          <div className="pbt-score"><span>{t.score}</span><strong>{attempt.score}<small> / {attempt.maxScore}</small></strong><span>{t.correct} {attempt.items.length - wrong.length} / {attempt.items.length}</span></div>
        </section> : <>
          <div className="pbt-exam-toolbar"><div className="pbt-exam-width pbt-exam-toolbar-inner">
            <Link className="pbt-exam-back" href={basePath} onClick={event => { if (busy || submitting) event.preventDefault(); }}><span aria-hidden="true">←</span> {t.back}</Link>
            <h1>{attempt.title} <span>· {t[attempt.mode]}</span></h1>
            {isListening ? <span className="ibt-timing-label">{timedListening ? listeningCopy[language].estimatedDuration[examFormat] : t.unlimited}</span> : <div className={`pbt-timer ${remaining !== null && remaining < 300 ? "is-urgent" : ""}`} role="timer" aria-label={remaining === null ? t.unlimited : `${t.remainingTime} ${clockText(remaining)}`} title={attempt.mode === "timed" ? t.timeHint : t.practiceHint}>
              {remaining !== null && <small>{t.remainingTime}</small>}<span>{remaining === null ? t.unlimited : clockText(remaining)}</span>
            </div>}
          </div></div>
          <div className="pbt-exam-width pbt-exam-alerts">
            {saveError && <p role="alert" className="pbt-alert">{t.saveFailed}</p>}
            {remaining === 0 && <p role="status" className="pbt-alert">{t.expired}</p>}
            {submitError && <div role="alert" className="pbt-alert">{t.submitFailed} <button onClick={() => void submit()}>{t.retry}</button></div>}
          </div>
        </>}
        {review ? <section className="pbt-review"><div className="pbt-review-heading"><h2>{t.review}</h2><div className="pbt-section-tabs">
          <button aria-pressed={!wrongOnly} onClick={() => setWrongOnly(false)}>{t.all}</button><button aria-pressed={wrongOnly} onClick={() => setWrongOnly(true)}>{t.wrongOnly} ({wrong.length})</button>
        </div></div>
          {(wrongOnly ? wrong : attempt.items).map(item => <div className="pbt-review-item" key={item.position}>
            {item.audioUrl && <ListeningPlayer url={item.audioUrl} />}
            <PbtQuestion question={item} review />
          </div>)}
          {wrongOnly && !wrong.length && <p>{t.noWrong}</p>}
        </section> : first && last && <>
          {isListening ? <ListeningSession examFormat={examFormat} key={playbackKey} attemptId={id} position={first.position} lastPosition={last.position}
            total={total} questionCount={group.length} url={first.audioUrl} mode={attempt.mode} stopped={submitting}
            volume={listeningVolume} onVolumeChange={setListeningVolume}
            paperRef={paperRef} onComplete={completePassage}>{questions}</ListeningSession> : <section ref={paperRef} className="pbt-exam-width pbt-test-paper" tabIndex={-1} aria-labelledby="pbt-section-title">
            <div className={`pbt-paper-heading${first.audioUrl ? " has-audio" : ""}`}>
              <h2 id="pbt-section-title">[{t[attempt.section]}]</h2>
              {first.audioUrl && <div className="pbt-audio-time" role="timer" aria-label={`${t.audioTime}: ${audioTime}`} title={t.audioTimeHint}>
                <span>{t.audioTime}</span><strong>{audioTime}</strong>
              </div>}
              <span className="pbt-position">{first.position}{grouped ? `–${last.position}` : ""} / {total}</span>
            </div>
            {first.audioUrl && <ListeningPlayer key={playbackKey} url={first.audioUrl} mode={attempt.mode}
              playbackKey={playbackKey} stopped={submitting || remaining === 0} onPlayingChange={setAudioPlaying} onProgressChange={updateAudioProgress} />}
            {questions}
          </section>}
          {!timedListening && <nav className="pbt-test-navigation" aria-label={t.questionNavigation}><div className="pbt-exam-width">
            <button className="button pbt-secondary" disabled={first.position <= 1 || busy || submitting || audioPlaying} onClick={() => go(first.position - 1)}><span aria-hidden="true">←</span> {t.previous}</button>
            <button className="button pbt-secondary pbt-all-questions" aria-haspopup="dialog" onClick={() => setDialog("questions")} disabled={busy || submitting}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M1 1h3v3H1zm5 0h3v3H6zm5 0h3v3h-3zM1 6h3v3H1zm5 0h3v3H6zm5 0h3v3h-3zM1 11h3v3H1zm5 0h3v3H6zm5 0h3v3h-3z" /></svg>
              {t.allQuestions}
            </button>
            {last.position >= total
              ? <button className="button button-primary" disabled={disabled} onClick={() => setDialog("submit")}>{submitting ? t.submitting : t.submit}</button>
              : <button className="button pbt-secondary" disabled={busy || submitting || audioPlaying} onClick={() => go(last.position + 1)}>{t.next} <span aria-hidden="true">→</span></button>}
          </div></nav>}
        </>}
      </>}
    </div>
    <dialog ref={dialogRef} className={`pbt-dialog${dialog === "questions" ? " pbt-navigator-dialog" : ""}`} onCancel={() => setDialog(null)} aria-labelledby="pbt-dialog-title">
      {dialog === "questions" && <button className="pbt-dialog-close" type="button" aria-label={t.close} onClick={() => setDialog(null)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
      </button>}
      <h2 ref={dialogTitleRef} id="pbt-dialog-title" tabIndex={-1}>{dialog === "questions" ? t.allQuestions : t.confirm}</h2>
      {dialog === "questions" ? <>
        <p className="pbt-navigator-summary">{t.answered} <strong>{answered} / {total}</strong><span>{t.unanswered} <strong>{total - answered}</strong></span></p>
        <div className="pbt-number-grid">
          {attempt?.items.map(item => <button key={item.position} className={isAnswered(item) ? "is-answered" : ""} aria-current={group.some(q => q.position === item.position) ? "step" : undefined} aria-label={`${item.position}: ${isAnswered(item) ? `${t.yourAnswer} ${answerText(item)}` : t.noAnswer}`} disabled={busy || submitting || audioPlaying} onClick={() => go(item.position)}>{item.position}</button>)}
        </div>
        <div className="pbt-navigator-legend"><span><i className="is-current" />{t.currentQuestion}</span><span><i className="is-answered" />{t.answered}</span><span><i />{t.noAnswer}</span></div>
        <p className="pbt-muted">{attempt?.mode === "timed" ? t.timeHint : t.saveHint}</p>
        <div className="pbt-dialog-actions"><button className="button button-primary" disabled={disabled} onClick={() => setDialog("submit")}>{t.submit}</button></div>
      </> : <>
        <p>{t.unanswered}: {total - answered}</p>
        <div className="pbt-dialog-actions"><button className="button pbt-secondary" onClick={() => setDialog(null)}>{t.cancel}</button><button className="button button-primary" onClick={() => void submit()} disabled={busy || submitting}>{t.submit}</button></div>
      </>}
    </dialog>
  </main></div>;
}
