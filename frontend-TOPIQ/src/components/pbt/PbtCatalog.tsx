"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import useRouter from "@/lib/use-navigation-router";
import { useApp } from "@/app/providers";
import { PbtError, pbtRequest, type Attempt, type Exam, type Mode, type Section } from "@/lib/exam/pbt-api";
import type { ExamFormat } from "@/lib/exam/exam-content";
import { examCopy, ibtTimedHints, pbtErrorMessage } from "@/lib/exam/pbt-content";
import SiteHeader from "../SiteHeader";
import SiteFooter from "../SiteFooter";
import { writingContent } from "@/lib/writing/writing-content";
import { localizedPath } from "@/lib/locale-path";
import ExamHistory from "@/app/settings/exam-history/ExamHistory";

export default function PbtCatalog({ examFormat = "pbt" }: { examFormat?: ExamFormat }) {
  const { language, user, refreshSession } = useApp();
  const basePath = localizedPath(`/${examFormat}`, language);
  const t = examCopy(language, examFormat);
  const loginLabel = writingContent[language].loginToOpen;
  const plusDialog = useRef<HTMLDialogElement>(null);
  const returnTarget = useRef("");
  const locale = language === "ko" ? "ko-KR" : language === "id" ? "id-ID" : "en-US";
  const router = useRouter();
  const [section, setSection] = useState<Section>("reading");
  const [mode, setMode] = useState<Mode>("practice");
  const [exams, setExams] = useState<Exam[]>([]);
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
    setLoading(true); setError(null); setExams([]);
    void (async () => {
      try {
        const catalog = await pbtRequest<{ exams: Exam[] }>("exams/", "GET", undefined, examFormat);
        if (active) setExams(catalog.exams);
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
          const result = progress?.latestResult;
          const resultLabel = result ? `${t.latestScore} · ${t[mode]}: ${result.score} / ${result.maxScore} · ${t.submittedOn}: ${new Date(result.submittedAt).toLocaleDateString(locale)} · ${t.result}` : "";
          return <article className="pbt-exam-card catalog-card" id={`exam-${exam.id}`} tabIndex={-1} key={exam.id}>
            <div className="pbt-card-top">
              <span className="catalog-set-number">{String(exam.round).padStart(2, "0")}</span>
              {result ? <Link className="pbt-badge pbt-badge-score" href={`${basePath}/attempts/${result.id}/result`} title={resultLabel} aria-label={resultLabel}>
                {result.score} / {result.maxScore} <ExternalLink size={13} aria-hidden="true" />
              </Link> : exam.freeAvailable && <span className="pbt-badge pbt-badge-free">Free</span>}
            </div>
            <h2>{language === "ko" ? `${t[exam.section]} 모의고사 ${exam.round}회` : <>{t[exam.section]} · {t.round} {exam.round}</>}</h2>
            {!user ? <Link className="pbt-login-action" href={`/login?next=${encodeURIComponent(`${basePath}?section=${section}&mode=${mode}#exam-${exam.id}`)}`}>
              <Lock size={16} aria-hidden="true" />{loginLabel}<ArrowRight size={17} aria-hidden="true" />
            </Link> : <button type="button" className="pbt-start-action" disabled={!!starting}
              aria-haspopup={exam.accessible ? undefined : "dialog"}
              onClick={() => exam.accessible ? void start(exam, progress?.inProgressId ?? undefined) : plusDialog.current?.showModal()}>
              {t.start}<ExternalLink size={14} aria-hidden="true" />
            </button>}
          </article>;
        })}
      </div> : !hasError && <p className="catalog-status">{t.empty}</p>}
      {user && <dialog ref={plusDialog} className="pbt-dialog" aria-labelledby="exam-plus-title" aria-describedby="exam-plus-note"
        onClick={event => { if (event.target === event.currentTarget) plusDialog.current?.close(); }}>
        <h2 id="exam-plus-title">{t.plusDialogTitle}</h2>
        <p id="exam-plus-note">{t.plusRequired}</p>
        <div className="pbt-dialog-actions">
          <button type="button" className="button pbt-secondary" onClick={() => plusDialog.current?.close()}>{t.close}</button>
          <Link className="button button-primary" href={localizedPath("/plans", language)}>{t.viewPlus}</Link>
        </div>
      </dialog>}
      {user && <section className="pbt-catalog-history" aria-labelledby="pbt-catalog-history-title">
        <h2 id="pbt-catalog-history-title">{t.history}</h2>
        <ExamHistory format={examFormat} />
      </section>}
    </div>
  </main><SiteFooter /></>;
}
