"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import type { ExamFormat } from "@/lib/exam/exam-content";
import { PbtError, pbtRequest, type Attempt, type Exam } from "@/lib/exam/pbt-api";
import { pbtContent, pbtErrorMessage } from "@/lib/exam/pbt-content";
import { localizedPath } from "@/lib/locale-path";
import useRouter from "@/lib/use-navigation-router";

type HistoryAttempt = Attempt & { accessible: boolean };
const formats = ["pbt", "ibt"] as const;

async function loadAttempts(format: ExamFormat): Promise<HistoryAttempt[]> {
  const { attempts } = await pbtRequest<{ attempts: Attempt[] }>("attempts/", "GET", undefined, format);
  const accessibleIds = new Set<string>();
  if (attempts.some(attempt => attempt.status === "in_progress")) {
    const { exams } = await pbtRequest<{ exams: Exam[] }>("exams/", "GET", undefined, format);
    for (const exam of exams) if (exam.accessible) accessibleIds.add(exam.id);
  }
  return attempts.map(attempt => ({ ...attempt, accessible: accessibleIds.has(attempt.examId) }));
}

export default function ExamHistory() {
  const { language, user, status, refreshSession } = useApp();
  const a = authContent[language];
  if (status === "loading") return <p role="status">{a.loading}</p>;
  if (status === "error") return <div className="catalog-status" role="alert">
    <p>{a.network}</p><button type="button" className="button credits-secondary" onClick={refreshSession}>{a.retry}</button>
  </div>;
  if (!user) {
    const next = localizedPath("/settings/exam-history", language);
    return <Link className="button button-primary" href={`${localizedPath("/login", language)}?next=${encodeURIComponent(next)}`}>{a.login}</Link>;
  }
  return <MemberHistory key={`${user.id}-${user.plusEndsAt ?? ""}`} />;
}

function MemberHistory() {
  const { language, refreshSession } = useApp();
  const t = pbtContent[language];
  const router = useRouter();
  const [attempts, setAttempts] = useState<HistoryAttempt[] | null>(null);
  const [failedFormats, setFailedFormats] = useState<ExamFormat[]>([]);
  const [revision, setRevision] = useState(0);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => () => { pending.current = null; }, []);

  useEffect(() => {
    let active = true;
    setAttempts(null);
    setFailedFormats([]);
    void Promise.allSettled(formats.map(loadAttempts)).then(results => {
      if (!active) return;
      const rows: HistoryAttempt[] = [];
      const failed: ExamFormat[] = [];
      for (const [index, result] of results.entries()) {
        if (result.status === "fulfilled") rows.push(...result.value);
        else if (result.reason instanceof PbtError && result.reason.status === 401) {
          void refreshSession();
          return;
        } else failed.push(formats[index]);
      }
      setFailedFormats(failed);
      setAttempts(rows.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)));
    });
    return () => { active = false; };
  }, [revision, refreshSession]);

  async function endAndReview(attempt: Attempt) {
    if (pending.current) return;
    pending.current = attempt.id;
    setSubmitting(attempt.id);
    setSubmitError(null);
    try {
      await pbtRequest(`attempts/${attempt.id}/submit/`, "POST", {}, attempt.examFormat);
      if (pending.current === attempt.id) router.push(localizedPath(`/${attempt.examFormat}/attempts/${attempt.id}/result`, language));
    } catch (error) {
      if (pending.current !== attempt.id) return;
      pending.current = null;
      setSubmitting(null);
      setSubmitError(error);
      if (error instanceof PbtError && error.status === 401) void refreshSession();
    }
  }

  if (!attempts) return <p role="status">{t.loading}</p>;
  return <>
    {failedFormats.length > 0 && <div className="catalog-status" role="alert">
      <p>{failedFormats.join(" / ").toUpperCase()} · {t.error}</p>
      <button type="button" className="button credits-secondary" onClick={() => setRevision(n => n + 1)}>{t.retry}</button>
    </div>}
    {submitError != null && <p className="catalog-status" role="alert">{pbtErrorMessage(submitError, t)}</p>}
    {!failedFormats.length && !attempts.length && <p className="text-muted">{t.noHistory}</p>}
    {attempts.length > 0 && <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
      {attempts.map(attempt => {
        const submitted = attempt.status === "submitted";
        const locked = !submitted && !attempt.accessible;
        const path = `/${attempt.examFormat}/attempts/${attempt.id}`;
        const round = /^TOPIK II (?:PBT|IBT) (\d+)$/.exec(attempt.title)?.[1];
        const title = round
          ? language === "ko" ? `${t[attempt.section]} 모의고사 ${round}회` : `${t[attempt.section]} · ${t.round} ${round}`
          : `${attempt.title} · ${t[attempt.section]}`;
        return <li key={attempt.id} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-4">
          <div>
            <p className="text-sm text-muted">{attempt.examFormat.toUpperCase()} · {t[attempt.mode]} · {submitted ? t.submitted : t.inProgress}</p>
            <p className="mt-1 font-semibold">{title}</p>
            <time className="text-sm text-muted" dateTime={attempt.startedAt}>{new Date(attempt.startedAt).toLocaleString(language)}</time>
          </div>
          <div className="flex flex-wrap items-center gap-x-4">
            {submitted && attempt.score !== null && <span className="text-sm">{t.score} {attempt.score} / {attempt.maxScore}</span>}
            {!submitted && !locked && attempt.mode === "timed"
              ? <button type="button" className="text-link" disabled={submitting !== null} onClick={() => void endAndReview(attempt)}>
                {submitting === attempt.id ? t.submitting : t.endAndReview}<ArrowRight size={14} aria-hidden="true" />
              </button>
              : <Link className="text-link" href={localizedPath(locked ? "/plans" : submitted ? `${path}/result` : path, language)}>
                {locked ? t.viewPlus : submitted ? t.result : t.resume}<ArrowRight size={14} aria-hidden="true" />
              </Link>}
          </div>
        </li>;
      })}
    </ul>}
  </>;
}
