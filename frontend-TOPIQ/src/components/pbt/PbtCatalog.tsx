"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers";
import { pbtRequest, type Attempt, type Exam, type Mode, type Section } from "@/lib/pbt-api";
import { pbtContent, pbtErrorMessage } from "@/lib/pbt-content";
import SiteHeader from "../SiteHeader";
import SiteFooter from "../SiteFooter";

export default function PbtCatalog() {
  const { language, user, status, refreshSession } = useApp();
  const t = pbtContent[language];
  const locale = language === "ko" ? "ko-KR" : language === "id" ? "id-ID" : "en-US";
  const router = useRouter();
  const [section, setSection] = useState<Section>("reading");
  const [mode, setMode] = useState<Mode>("practice");
  const [exams, setExams] = useState<Exam[]>([]);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => { if (status === "error") void refreshSession(); else setRevision(n => n + 1); }, [status, refreshSession]);

  useEffect(() => {
    if (status === "loading" || status === "error") return;
    let active = true;
    setLoading(true); setError(null); setExams([]); setAttempts([]);
    void (async () => {
      try {
        // The catalog establishes the guest session before fetching its history.
        const catalog = await pbtRequest<{ exams: Exam[] }>("exams/");
        const history = await pbtRequest<{ attempts: Attempt[] }>("attempts/");
        if (active) { setExams(catalog.exams); setAttempts(history.attempts); }
      } catch (cause) { if (active) setError(cause); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [status, user?.id, revision]);

  async function start(exam: Exam) {
    if (starting) return;
    setStarting(exam.id); setError(null);
    try {
      const attempt = await pbtRequest<Attempt>("attempts/", "POST", { examId: exam.id, mode });
      router.push(`/pbt/attempts/${attempt.id}`);
    } catch (cause) { setError(cause); setStarting(null); }
  }

  return <><SiteHeader /><main id="main-content" className="pbt-main" tabIndex={-1}>
    <section className="pbt-hero"><div className="page-container">
      <p className="eyebrow">TOPIK II · PBT MOCK TEST</p><h1>{t.title}</h1><p>{t.intro}</p>
      <div className="pbt-access-note">{user ? t.memberNote : t.guestNote}</div>
    </div></section>
    <div className="page-container pbt-catalog">
      <div className="pbt-section-tabs" aria-label="TOPIK II">
        {(["reading", "listening"] as const).map(value => <button type="button" key={value} aria-pressed={section === value} onClick={() => setSection(value)}>{t[value]}</button>)}
      </div>
      <div className="pbt-modes">
        {(["practice", "timed"] as const).map(value => <button className="pbt-mode" type="button" key={value} aria-pressed={mode === value} onClick={() => setMode(value)}>
          <span className="pbt-radio" /><span><strong>{t[value]}</strong><small>{value === "practice" ? t.practiceHint : t.timedHint}</small></span>
          <span className="pbt-mode-time">{value === "practice" ? "∞" : `${section === "listening" ? 60 : 70} ${t.minutes}`}</span>
        </button>)}
      </div>
      {(error || status === "error") ? <div role="alert" className="pbt-alert">{pbtErrorMessage(error, t)} <button onClick={retry}>{t.retry}</button></div> : null}
      {loading || status === "loading" ? <p role="status">{t.loading}</p> : <div className="pbt-exam-grid">
        {exams.filter(exam => exam.section === section).map(exam => {
          const progress = user ? exam.myProgress?.[mode] : null;
          const result = progress?.latestResult;
          const resultLabel = result ? `${t.latestScore} · ${t[mode]}: ${result.score} / ${result.maxScore} · ${t.submittedOn}: ${new Date(result.submittedAt).toLocaleDateString(locale)} · ${t.result}` : "";
          return <article className="pbt-exam-card" key={exam.id}>
            <div className="pbt-card-top">
              <span className="pbt-set-number">{String(exam.round).padStart(2, "0")}</span>
              {result ? <Link className="pbt-badge pbt-badge-score" href={`/pbt/attempts/${result.id}/result`} title={resultLabel} aria-label={resultLabel}>
                {result.score} / {result.maxScore} <span aria-hidden="true">↗</span>
              </Link> : <span className={`pbt-badge ${exam.guestAvailable ? "pbt-badge-free" : ""}`}>{exam.guestAvailable ? t.free : t.members}</span>}
            </div>
            <h2>{t[exam.section]} · {t.round} {exam.round}</h2>
            <p>{exam.questionCount} {t.questions} <span>·</span> {mode === "practice" ? t.unlimited : `${exam.durationSeconds / 60} ${t.minutes}`}</p>
            {progress?.inProgressId ? <Link className="button button-primary" href={`/pbt/attempts/${progress.inProgressId}`}>{t.resume}<span aria-hidden="true">↗</span></Link>
              : exam.accessible ? <button className="button button-primary" disabled={!!starting} onClick={() => void start(exam)}>{starting === exam.id ? t.loading : result ? t.retake : t.start}<span aria-hidden="true">↗</span></button>
              : <Link className="button pbt-secondary" href="/login?next=/pbt">{t.login}<span aria-hidden="true">↗</span></Link>}
          </article>;
        })}
        {!exams.some(exam => exam.section === section) && !error && <p>{t.empty}</p>}
      </div>}
      <section className="pbt-history" aria-labelledby="pbt-history"><h2 id="pbt-history">{t.history}</h2>
        {!user && <p className="pbt-muted">{t.guestHistory}</p>}
        {!loading && !attempts.length && <p className="pbt-muted">{t.noHistory}</p>}
        {attempts.map(attempt => <div className="pbt-history-row" key={attempt.id}>
          <div><strong>{attempt.title} · {t[attempt.section]}</strong><small>{t[attempt.mode]} · {new Date(attempt.startedAt).toLocaleString(language === "ko" ? "ko-KR" : language === "id" ? "id-ID" : "en-US")}</small></div>
          <span>{attempt.status === "submitted" ? `${attempt.score} / 100` : t.inProgress}</span>
          <Link className="text-link" href={`/pbt/attempts/${attempt.id}${attempt.status === "submitted" ? "/result" : ""}`}>{attempt.status === "submitted" ? t.result : t.resume} →</Link>
        </div>)}
      </section>
    </div>
  </main><SiteFooter /></>;
}
