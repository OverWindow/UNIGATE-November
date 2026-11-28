"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Grid3x3, X } from "lucide-react";
import useRouter from "@/lib/use-navigation-router";
import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { useApp } from "@/app/providers";
import { answerText, isAnswered, clockText, pbtRequest, PbtError, remainingSeconds, questionGroup, submitOnPageExit, type Answer, type Attempt } from "@/lib/exam/pbt-api";
import { guardTimedExit } from "@/lib/exam/timed-exit";
import { trackEvent } from "@/lib/analytics";
import { closeWithMotion } from "@/lib/modal-motion";
import type { ExamFormat } from "@/lib/exam/exam-content";
import { examCopy, pbtErrorMessage } from "@/lib/exam/pbt-content";
import SiteHeader from "../SiteHeader";
import PbtQuestion, { QuestionMaterial } from "./PbtQuestion";
import ListeningPlayer, { type AudioProgress } from "./ListeningPlayer";
import ListeningSession from "./ListeningSession";
import { listeningCopy } from "@/lib/exam/listening";

type AttemptDialog = "questions" | "submit" | "exit" | "passage" | null;

function isDialogBackdrop(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  // The native dialog receives taps on both its padding and its backdrop.
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom;
}

export default function PbtAttempt({ id, review = false, examFormat = "pbt" }: { id: string; review?: boolean; examFormat?: ExamFormat }) {
  const basePath = `/${examFormat}`;
  const { language, user, status, refreshSession } = useApp();
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
  const [dialog, setDialog] = useState<AttemptDialog>(null);
  const [showPassageButton, setShowPassageButton] = useState(false);
  const pageSession = useRef("");
  const attemptActive = useRef(false);
  const timedSessionActive = useRef(false);
  const exitAction = useRef<(() => void) | null>(null);
  const visibleDialog = useRef<AttemptDialog>(null);
  const closeAnimation = useRef<Animation | null>(null);
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
  const inProgress = !review && attempt?.status === "in_progress";
  const [audioProgress, setAudioProgress] = useState<AudioProgress | null>(null);
  const updateAudioProgress = useCallback((next: AudioProgress) => {
    setAudioProgress(current => current && current.playbackKey === next.playbackKey && current.elapsed === next.elapsed && current.duration === next.duration ? current : next);
  }, []);
  const receivedAt = useRef(0);
  const autoSubmitted = useRef(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pressedBackdrop = useRef(false);
  const dialogDismissRef = useRef<HTMLButtonElement>(null);
  const paperRef = useRef<HTMLElement>(null);
  const sharedMaterialRef = useRef<HTMLDivElement>(null);
  const passageButtonRef = useRef<HTMLButtonElement>(null);
  const retry = () => setRevision(n => n + 1);

  const handleAccessError = useCallback((cause: unknown) => {
    if (!(cause instanceof PbtError)) return false;
    if (cause.status === 401) {
      void refreshSession();
      return true;
    }
    if (cause.code !== "plus_required") return false;
    attemptActive.current = false;
    timedSessionActive.current = false;
    setDialog(null); setAttempt(null); setError(cause);
    return true;
  }, [refreshSession]);

  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    attemptActive.current = false;
    timedSessionActive.current = false;
    setAttempt(null); setError(null);
    if (!pageSession.current) pageSession.current = crypto.randomUUID();
    const request = review
      ? pbtRequest<Attempt>(`attempts/${id}/result/`, "GET", undefined, examFormat)
      : pbtRequest<Attempt>(`attempts/${id}/enter/`, "POST", { sessionToken: pageSession.current }, examFormat);
    void request.then(data => {
      if (!active) return;
      if (!review && data.status === "submitted") { router.replace(`${basePath}/attempts/${id}/result`); return; }
      attemptActive.current = !review && data.status === "in_progress";
      timedSessionActive.current = attemptActive.current && data.mode === "timed";
      receivedAt.current = performance.now();
      autoSubmitted.current = false;
      completedPositionRef.current = null; completionHandled.current = null; setCompletedPosition(null);
      const listening = data.section === "listening";
      setPosition(1);
      setRemaining(listening ? null : remainingSeconds(data, 0)); setAttempt(data);
    }).catch(cause => {
      if (!active || handleAccessError(cause)) return;
      if (review && cause instanceof PbtError && cause.code === "result_email_required") {
        router.replace(`${basePath}/attempts/${id}/feedback`); return;
      }
      setError(cause);
    });
    return () => { active = false; };
  }, [id, review, revision, status, user?.id, user?.plusEndsAt, router, basePath, examFormat, handleAccessError]);

  const requestExit = useCallback((leave: () => void) => {
    if (!attemptActive.current) { leave(); return; }
    exitAction.current = leave;
    setDialog("exit");
  }, []);

  useEffect(() => {
    if (!inProgress) return;
    return guardTimedExit({
      id: `${examFormat}:${id}`, fallback: basePath, isActive: () => attemptActive.current, requestExit,
      pageExit: () => {
        if (!timedSessionActive.current) return;
        attemptActive.current = false;
        timedSessionActive.current = false;
        pageSession.current = "";
        submitOnPageExit(id, examFormat);
      },
      restore: () => { setAttempt(null); setRevision(n => n + 1); },
    });
  }, [inProgress, id, examFormat, basePath, requestExit]);

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
    const element = dialogRef.current;
    if (!element) return;
    if (dialog) {
      closeAnimation.current?.cancel();
      closeAnimation.current = null;
      visibleDialog.current = dialog;
      if (!element.open) {
        element.showModal();
        if (dialog === "passage") trackEvent("select_content", { content_type: "pbt_reading_passage", content_id: "shared_passage" });
      }
      dialogDismissRef.current?.focus({ preventScroll: true });
    } else if (element.open) {
      closeAnimation.current = closeWithMotion(element, () => {
        element.close();
        if (visibleDialog.current === "passage") passageButtonRef.current?.focus({ preventScroll: true });
        visibleDialog.current = null;
        closeAnimation.current = null;
      });
    }
  }, [dialog]);

  useEffect(() => () => closeAnimation.current?.cancel(), []);

  const submit = useCallback(async (leave?: () => void) => {
    if (submittingRef.current || busyRef.current) return;
    submittingRef.current = true; setSubmitting(true); setSubmitError(false); setDialog(null);
    try {
      await pbtRequest<Attempt>(`attempts/${id}/submit/`, "POST", {}, examFormat);
      attemptActive.current = false;
      timedSessionActive.current = false;
      if (leave) leave();
      else router.replace(`${basePath}/attempts/${id}/result`);
    } catch (cause) {
      if (!handleAccessError(cause)) setSubmitError(true);
      submittingRef.current = false; setSubmitting(false);
    }
  }, [id, router, basePath, examFormat, handleAccessError]);

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
      await pbtRequest(`attempts/${id}/answers/${itemPosition}/`, "PUT", value, examFormat, pageSession.current);
    } catch (cause) {
      if (handleAccessError(cause)) return;
      if (cause instanceof PbtError && ["attempt_closed", "attempt_session_required"].includes(cause.code)) {
        attemptActive.current = false;
        timedSessionActive.current = false;
        router.replace(`${basePath}/attempts/${id}/result`);
      }
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
  const sharedQuestion = grouped && (first.passage || first.materialUrl || first.auxiliary)
    ? { ...first, highlight: group.find(item => item.highlight)?.highlight || "" } : null;
  const total = attempt?.items.length ?? 0;
  const passageGroupStart = !review && examFormat === "pbt" && attempt?.section === "reading" ? sharedQuestion?.position : undefined;
  const answered = attempt?.items.filter(isAnswered).length ?? 0;
  const wrong = attempt?.items.filter(item => !item.isCorrect) ?? [];
  const disabled = busy || submitting || remaining === 0 || (timedListening && completedPosition === first?.position);

  useEffect(() => {
    const paper = paperRef.current;
    const passage = sharedMaterialRef.current;
    if (passageGroupStart === undefined || !paper || !passage) return;

    const mobile = window.matchMedia("(max-width: 760px)");
    const update = () => {
      const bounds = passage.getBoundingClientRect();
      const scrollAreaTop = paper.getBoundingClientRect().top + paper.clientTop;
      setShowPassageButton(mobile.matches && bounds.height > 0 && bounds.top + bounds.height / 2 <= scrollAreaTop);
    };
    const onWidthChange = () => {
      update();
      if (!mobile.matches) setDialog(current => current === "passage" ? null : current);
    };
    const resize = new ResizeObserver(update);
    resize.observe(paper);
    resize.observe(passage);
    update();
    paper.addEventListener("scroll", update, { passive: true });
    mobile.addEventListener("change", onWidthChange);
    return () => {
      resize.disconnect();
      paper.removeEventListener("scroll", update);
      mobile.removeEventListener("change", onWidthChange);
      setShowPassageButton(false);
    };
  }, [passageGroupStart]);

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

  const questions = first && last && <div className={sharedQuestion ? "pbt-group-layout" : undefined}>
    {sharedQuestion && <section className="pbt-shared">
      <p>{first.position}–{last.position} · {t.group}</p>
      <div ref={sharedMaterialRef}><QuestionMaterial question={sharedQuestion} /></div>
    </section>}
    <div className="pbt-group-questions">
      {group.map(item => <PbtQuestion key={item.position} question={item} shared={!!sharedQuestion} disabled={disabled} onAnswer={(p, o) => void answer(p, o)} />)}
    </div>
  </div>;

  const shownDialog = dialog ?? visibleDialog.current;
  const exitTimed = attempt?.mode === "timed";
  const dialogTitles = { questions: t.allQuestions, passage: t.group, exit: exitTimed ? t.exitTitle : t.practiceExitTitle, submit: t.confirm };

  return <div className={!review && attempt ? "pbt-session" : undefined}><SiteHeader onBeforeLogout={inProgress ? action => requestExit(() => { router.replace(basePath); action(); }) : undefined} /><main id="main-content" className={`pbt-workspace${review ? "" : " pbt-exam"}`} tabIndex={-1}>
    <div className={review ? "page-container" : "pbt-exam-content"}>
      {(review || !attempt) && <div className={review ? undefined : "pbt-exam-width pbt-exam-loading"}>
        <Link className="text-link pbt-back" href={basePath}><ArrowLeft size={14} aria-hidden="true" /> {t.back}</Link>
        {error ? <div className="pbt-alert" role="alert">{pbtErrorMessage(error, t)} {error instanceof PbtError && error.code === "plus_required"
          ? <Link href="/plans">{t.viewPlus}</Link> : <button onClick={retry}>{t.retry}</button>}</div> : !attempt && <p role="status">{t.loading}</p>}
      </div>}
      {attempt && <>
        {review ? <section className="pbt-result-summary">
          <div><h1>{language === "ko" ? attempt.title.replace(/ (\d+)$/, ` ${t[attempt.section]} 모의고사 $1회`) : attempt.title}</h1>{attempt.timedOut && <p>{t.timedOut}</p>}</div>
          <div className="pbt-score"><span>{t.score}</span><strong>{attempt.score}<small> / {attempt.maxScore}</small></strong><span>{t.correct} {attempt.items.length - wrong.length} / {attempt.items.length}</span></div>
        </section> : <>
          <div className="pbt-exam-toolbar"><div className="pbt-exam-width pbt-exam-toolbar-inner">
            <Link className="pbt-exam-back" href={basePath} onClick={event => { if (busy || submitting) event.preventDefault(); }}><ArrowLeft size={14} aria-hidden="true" /> {t.back}</Link>
            <h1>{language === "ko" ? attempt.title.replace(/ (\d+)$/, " 모의고사 $1회") : attempt.title}</h1>
            {passageGroupStart !== undefined && <button ref={passageButtonRef} type="button" className="pbt-passage-button" data-visible={showPassageButton} aria-haspopup="dialog" onClick={() => setDialog("passage")}>{t.viewPassage}</button>}
            {isListening ? <span className="ibt-timing-label">{timedListening ? listeningCopy[language].estimatedDuration[examFormat] : t.unlimited}</span> : <div className={`pbt-timer ${remaining !== null && remaining < 300 ? "is-urgent" : ""}`} role="timer" aria-label={remaining === null ? t.unlimited : `${t.remainingTime} ${clockText(remaining)}`} title={attempt.mode === "timed" ? undefined : t.practiceHint}>
              {remaining !== null && <small>{t.remainingTime}</small>}<span>{remaining === null ? t.unlimited : clockText(remaining)}</span>
            </div>}
          </div></div>
          <div className="pbt-exam-width pbt-exam-alerts">
            {saveError && <p role="alert" className="pbt-alert">{t.saveFailed}</p>}
            {remaining === 0 && <p role="status" className="pbt-alert">{t.expired}</p>}
            {submitError && <div role="alert" className="pbt-alert">{t.submitFailed} <button onClick={() => void submit()}>{t.retry}</button></div>}
          </div>
        </>}
        {review ? <section className="pbt-review"><div className="pbt-review-heading"><h2>{t.review}</h2><div className="pbt-section-tabs section-switch">
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
          {!timedListening && <nav className="pbt-test-navigation" data-dev-tools={process.env.NODE_ENV === "development" || undefined} aria-label={t.questionNavigation}><div className="pbt-exam-width">
            <button className="button pbt-secondary" disabled={first.position <= 1 || busy || submitting || audioPlaying} onClick={() => go(first.position - 1)}><ArrowLeft size={16} aria-hidden="true" /> {t.previous}</button>
            <button className="button pbt-secondary pbt-all-questions" aria-haspopup="dialog" onClick={() => setDialog("questions")} disabled={busy || submitting}>
              <Grid3x3 size={16} aria-hidden="true" />
              {t.allQuestions}
            </button>
            {last.position >= total
              ? <button className="button button-primary" disabled={disabled} onClick={() => setDialog("submit")}>{submitting ? t.submitting : t.submit}</button>
              : <button className="button pbt-secondary" disabled={busy || submitting || audioPlaying} onClick={() => go(last.position + 1)}>{t.next} <ArrowRight size={16} aria-hidden="true" /></button>}
          </div></nav>}
        </>}
      </>}
    </div>
    <dialog ref={dialogRef} className={`pbt-dialog${shownDialog === "questions" ? " pbt-navigator-dialog" : ""}`} aria-labelledby="pbt-dialog-title"
      onCancel={event => { event.preventDefault(); setDialog(null); }}
      onPointerDown={event => { pressedBackdrop.current = dialog === "passage" && event.isPrimary && event.button === 0 && isDialogBackdrop(event); }}
      onPointerCancel={() => { pressedBackdrop.current = false; }}
      onClick={event => {
        const dismiss = pressedBackdrop.current && dialog === "passage" && isDialogBackdrop(event);
        pressedBackdrop.current = false;
        if (dismiss) {
          setDialog(null);
          trackEvent("dismiss_passage", { method: "backdrop" });
        }
      }}>
      {(shownDialog === "questions" || shownDialog === "passage") && <button ref={dialogDismissRef} className="pbt-dialog-close" type="button" aria-label={t.close} onClick={() => setDialog(null)}>
        <X size={18} strokeWidth={1.7} aria-hidden="true" />
      </button>}
      <h2 id="pbt-dialog-title">{shownDialog && dialogTitles[shownDialog]}</h2>
      {shownDialog === "passage" ? sharedQuestion && <div className="pbt-dialog-material" role="region" aria-labelledby="pbt-dialog-title" tabIndex={0}>
        <QuestionMaterial question={sharedQuestion} />
      </div> : shownDialog === "questions" ? <>
        <p className="pbt-navigator-summary">{t.answered} <strong>{answered} / {total}</strong><span>{t.unanswered} <strong>{total - answered}</strong></span></p>
        <div className="pbt-number-grid">
          {attempt?.items.map(item => <button key={item.position} className={isAnswered(item) ? "is-answered" : ""} aria-current={group.some(q => q.position === item.position) ? "step" : undefined} aria-label={`${item.position}: ${isAnswered(item) ? `${t.yourAnswer} ${answerText(item)}` : t.noAnswer}`} disabled={busy || submitting || audioPlaying} onClick={() => go(item.position)}>{item.position}</button>)}
        </div>
        <div className="pbt-navigator-legend"><span><i className="is-current" />{t.currentQuestion}</span><span><i className="is-answered" />{t.answered}</span><span><i />{t.noAnswer}</span></div>
        {attempt?.mode !== "timed" && <p className="pbt-muted">{t.saveHint}</p>}
        <div className="pbt-dialog-actions"><button className="button button-primary" disabled={disabled} onClick={() => setDialog("submit")}>{t.submit}</button></div>
      </> : shownDialog === "exit" ? <>
        <p>{exitTimed ? t.exitWarning : t.practiceExitWarning}</p>
        <div className="pbt-dialog-actions"><button className="button pbt-secondary" disabled={busy || submitting} onClick={() => {
          if (exitTimed) void submit(exitAction.current ?? undefined);
          else { attemptActive.current = false; exitAction.current?.(); }
        }}>{exitTimed ? t.exitConfirm : t.practiceExitConfirm}</button><button ref={dialogDismissRef} className="button button-primary" onClick={() => setDialog(null)}>{t.cancel}</button></div>
      </> : <>
        <p>{t.unanswered}: {total - answered}</p>
        <div className="pbt-dialog-actions"><button ref={dialogDismissRef} className="button pbt-secondary" onClick={() => setDialog(null)}>{t.cancel}</button><button className="button button-primary" onClick={() => void submit()} disabled={busy || submitting}>{t.submit}</button></div>
      </>}
    </dialog>
  </main></div>;
}
