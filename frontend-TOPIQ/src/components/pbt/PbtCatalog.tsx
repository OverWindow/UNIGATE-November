"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Lock, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import useRouter from "@/lib/use-navigation-router";
import { useApp } from "@/app/providers";
import { PbtError, pbtRequest, type Attempt, type Exam, type Mode, type Section } from "@/lib/exam/pbt-api";
import type { ExamFormat } from "@/lib/exam/exam-content";
import { examCopy, ibtTimedHints, pbtErrorMessage } from "@/lib/exam/pbt-content";
import SiteHeader from "../SiteHeader";
import SiteFooter from "../SiteFooter";
import { writingContent } from "@/lib/writing/writing-content";

export default function PbtCatalog({ examFormat = "pbt" }: { examFormat?: ExamFormat }) {
  const basePath = `/${examFormat}`;
  const { language, user, refreshSession } = useApp();
  const t = examCopy(language, examFormat);
  const loginLabel = writingContent[language].loginToOpen;
  const loginDialog = useRef<HTMLDialogElement>(null);
  const [selectedId, setSelectedId] = useState("");
  const returnTarget = useRef("");
  const locale = language === "ko" ? "ko-KR" : language === "id" ? "id-ID" : "en-US";
  const router = useRouter();
  const [section, setSection] = useState<Section>("reading");
  const [mode, setMode] = useState<Mode>("practice");
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const startingRef = useRef(false);
  const [revision, setRevision] = useState(0);
  const retry = () => setRevision(n => n + 1);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    if (query.get("section") === "listening") setSection("listening");
    if (query.get("mode") === "timed") setMode("timed");
    returnTarget.current = window.location.hash.slice(1);
  }, []);
  useEffect(() => {
    if (loading || !returnTarget.current.startsWith("exam-")) return;
    const card = document.getElementById(returnTarget.current);
    if (card) { card.focus(); returnTarget.current = ""; }
  }, [loading, section, exams]);
  const showError = useCallback((cause: unknown) => {
    if (cause instanceof PbtError && cause.status === 401) void refreshSession();
    else setError(cause);
  }, [refreshSession]);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setExams([]); setAttempts([]);
    void (async () => {
      try {
        const catalog = await pbtRequest<{ exams: Exam[] }>("exams/", "GET", undefined, examFormat);
        const history = user ? await pbtRequest<{ attempts: Attempt[] }>("attempts/", "GET", undefined, examFormat) : null;
        if (active) { setExams(catalog.exams); setAttempts(history?.attempts ?? []); }
      } catch (cause) { if (active) showError(cause); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [user, revision, examFormat, showError]);

  async function start(exam: Exam, restartAttemptId?: string) {
    if (startingRef.current) return;
    startingRef.current = true;
    setStarting(exam.id); setError(null);
    try {
      const attempt = await pbtRequest<Attempt>("attempts/", "POST", {
        examId: exam.id, mode, ...(restartAttemptId ? { restartAttemptId } : {}),
      }, examFormat);
      router.push(`${basePath}/attempts/${attempt.id}`);
    } catch (cause) { showError(cause); setStarting(null); startingRef.current = false; }
  }

  const perPassage = section === "listening";
  async function endAndReview(attempt: Attempt) {
    if (startingRef.current) return;
    startingRef.current = true; setStarting(attempt.id); setError(null);
    try {
      await pbtRequest(`attempts/${attempt.id}/submit/`, "POST", {}, examFormat);
      router.push(`${basePath}/attempts/${attempt.id}/result`);
    } catch (cause) { showError(cause); setStarting(null); startingRef.current = false; }
  }

  const timedHint = perPassage ? ibtTimedHints[language].listening : examFormat === "ibt" ? ibtTimedHints[language].reading : t.timedHint;
  const sectionExams = exams.filter(exam => exam.section === section);
  const hasError = !!error;

  return <><SiteHeader /><main id="main-content" className="pbt-main" tabIndex={-1}>
    <section className="catalog-hero"><div className="page-container">
      <h1 className="catalog-title">{t.title}</h1><p className="catalog-description">{t.intro}</p>
    </div></section>
    <div className="page-container pbt-catalog">
      <div className="pbt-section-tabs section-switch" aria-label="TOPIK II">
        {(["reading", "listening"] as const).map(value => <button type="button" key={value} aria-pressed={section === value} onClick={() => setSection(value)}>{t[value]}</button>)}
      </div>
      <div className="pbt-modes">
        {(["practice", "timed"] as const).map(value => <button className="pbt-mode" type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
          <span className="pbt-radio" /><span><strong>{t[value]}</strong><small>{value === "practice" ? t.practiceHint : timedHint}</small></span>
        </button>)}
      </div>
      {hasError && <div className="catalog-status" role="alert">
        <p>{pbtErrorMessage(error, t)}</p>
        <button className="button pbt-secondary" onClick={retry}>{t.retry}</button>
      </div>}
      {!hasError && loading ? <p className="catalog-status" role="status">{t.loading}</p>
        : sectionExams.length ? <div className="pbt-exam-grid">
        {sectionExams.map(exam => {
          const progress = exam.myProgress?.[mode];
          const inProgressId = progress?.inProgressId ?? attempts.find(attempt => attempt.examId === exam.id && attempt.mode === mode && attempt.status === "in_progress")?.id;
          const canResume = mode === "practice" && !!inProgressId;
          const result = progress?.latestResult;
          const resultLabel = result ? `${t.latestScore} · ${t[mode]}: ${result.score} / ${result.maxScore} · ${t.submittedOn}: ${new Date(result.submittedAt).toLocaleDateString(locale)} · ${t.result}` : "";
          return <article className="pbt-exam-card catalog-card" id={`exam-${exam.id}`} tabIndex={-1} key={exam.id}>
            <div className="pbt-card-top">
              <span className="catalog-set-number">{String(exam.round).padStart(2, "0")}</span>
              {result ? <Link className="pbt-badge pbt-badge-score" href={`${basePath}/attempts/${result.id}/result`} title={resultLabel} aria-label={resultLabel}>
                {result.score} / {result.maxScore} <ExternalLink size={13} aria-hidden="true" />
              </Link> : <span className="pbt-badge pbt-badge-free">{exam.freeAvailable ? "Free" : "Plus"}</span>}
            </div>
            <h2>{language === "ko" ? `${t[exam.section]} 모의고사 ${exam.round}회` : <>{t[exam.section]} · {t.round} {exam.round}</>}</h2>
            {!user ? <button type="button" className="pbt-login-action" aria-haspopup="dialog"
              onClick={() => { setSelectedId(exam.id); loginDialog.current?.showModal(); }}>
              <Lock size={16} aria-hidden="true" />{loginLabel}<ArrowRight size={17} aria-hidden="true" />
            </button> : exam.accessible ? <div className="pbt-card-actions">
              {canResume && <Link className="button button-primary" href={`${basePath}/attempts/${inProgressId}`}>{t.resume}</Link>}
              <button type="button" className={`button ${canResume ? "pbt-secondary" : "button-primary"}`} disabled={!!starting} onClick={() => void start(exam, inProgressId)}>
                {starting === exam.id ? t.loading : inProgressId ? t.retake : t.start}
              </button>
            </div>
              : <Link className="button pbt-secondary" href="/plans">{t.viewPlus}<ArrowRight size={14} aria-hidden="true" /></Link>}
          </article>;
        })}
      </div> : !hasError && <p className="catalog-status">{t.empty}</p>}
      {user && <section className="pbt-history" aria-labelledby="pbt-history"><h2 id="pbt-history">{t.history}</h2>
        {!loading && !attempts.length && <p className="pbt-muted">{t.noHistory}</p>}
        {attempts.map(attempt => <div className="pbt-history-row" key={attempt.id}>
          <div><strong>{language === "ko" ? attempt.title.replace(/ (\d+)$/, ` ${t[attempt.section]} 모의고사 $1회`) : `${attempt.title} · ${t[attempt.section]}`}</strong><small>{new Date(attempt.startedAt).toLocaleString(locale)}</small></div>
          {attempt.status === "submitted" && attempt.score !== null && <span>{attempt.score} / {attempt.maxScore}</span>}
          {attempt.status === "in_progress" && !exams.some(exam => exam.id === attempt.examId && exam.accessible)
            ? <Link className="text-link" href="/plans">{t.viewPlus}</Link>
            : attempt.mode === "timed" && attempt.status === "in_progress"
            ? <button type="button" className="text-link" disabled={!!starting} onClick={() => void endAndReview(attempt)}>{t.endAndReview} <ArrowRight size={14} aria-hidden="true" /></button>
            : <Link className="text-link" href={`${basePath}/attempts/${attempt.id}${attempt.status === "submitted" ? "/result" : ""}`}>{attempt.status === "submitted" ? t.result : t.resume} <ArrowRight size={14} aria-hidden="true" /></Link>}
        </div>)}
      </section>}
      {!user && <dialog ref={loginDialog} className="pbt-dialog" aria-labelledby="exam-login-title" aria-describedby="exam-login-note"
        onClick={event => { if (event.target === event.currentTarget) loginDialog.current?.close(); }}>
        <button type="button" className="pbt-dialog-close" aria-label={t.close} onClick={() => loginDialog.current?.close()}><X size={18} /></button>
        <Lock size={24} aria-hidden="true" /><h2 id="exam-login-title">{loginLabel}</h2>
        <p id="exam-login-note">{t.loginRequired}</p>
        <Link className="button button-primary" href={`/login?next=${encodeURIComponent(`${basePath}?section=${section}&mode=${mode}#exam-${selectedId}`)}`}>{loginLabel}</Link>
      </dialog>}
    </div>
  </main><SiteFooter /></>;
}
