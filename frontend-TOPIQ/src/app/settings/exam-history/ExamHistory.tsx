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

async function loadAttempts(format: ExamFormat | "all", page: number) {
  const query = format === "all" ? `attempts/?format=all&page=${page}` : `attempts/?page=${page}`;
  const data = await pbtRequest<{ attempts: Attempt[]; pageCount: number }>(query, "GET", undefined, format === "all" ? "pbt" : format);
  const accessibleIds = new Set<string>();
  await Promise.all(formats.filter(value => data.attempts.some(attempt => attempt.examFormat === value && attempt.status === "in_progress"))
    .map(async value => {
      const { exams } = await pbtRequest<{ exams: Exam[] }>("exams/", "GET", undefined, value);
      for (const exam of exams) if (exam.accessible) accessibleIds.add(exam.id);
    }));
  return { attempts: data.attempts.map(attempt => ({ ...attempt, accessible: accessibleIds.has(attempt.examId) })), pageCount: data.pageCount };
}

export default function ExamHistory({ format = "all" }: { format?: ExamFormat | "all" }) {
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
  return <MemberHistory key={`${user.id}-${user.plusEndsAt ?? ""}-${format}`} format={format} />;
}

function MemberHistory({ format }: { format: ExamFormat | "all" }) {
  const { language, refreshSession } = useApp();
  const t = pbtContent[language];
  const router = useRouter();
  const [data, setData] = useState<{ attempts: HistoryAttempt[]; pageCount: number } | null>(null);
  const [page, setPage] = useState(1);
  const [loadError, setLoadError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<unknown>(null);
  const pending = useRef<string | null>(null);
  useEffect(() => () => { pending.current = null; }, []);

  useEffect(() => {
    let active = true;
    setData(null);
    setLoadError(false);
    void loadAttempts(format, page).then(result => {
      if (active) setData(result);
    }).catch(error => {
      if (!active) return;
      setLoadError(true);
      if (error instanceof PbtError && error.status === 401) void refreshSession();
    });
    return () => { active = false; };
  }, [format, page, revision, refreshSession]);

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

  if (!data && !loadError) return <p role="status">{t.loading}</p>;
  return <>
    {loadError && <div className="catalog-status" role="alert">
      <p>{t.error}</p>
      <button type="button" className="button credits-secondary" onClick={() => setRevision(n => n + 1)}>{t.retry}</button>
    </div>}
    {submitError != null && <p className="catalog-status" role="alert">{pbtErrorMessage(submitError, t)}</p>}
    {data && !data.attempts.length && <p className="text-muted">{t.noHistory}</p>}
    {data && data.attempts.length > 0 && <ul className="divide-y divide-slate-200 rounded-xl border border-slate-200">
      {data.attempts.map(attempt => {
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
    {data && data.pageCount > 1 && <nav className="exam-history-pagination" aria-label={t.history}>
      {page > 1 ? <button type="button" onClick={() => setPage(page - 1)}>{t.previous}</button> : <span aria-disabled="true">{t.previous}</span>}
      <span aria-current="page">{page} / {data.pageCount}</span>
      {page < data.pageCount ? <button type="button" onClick={() => setPage(page + 1)}>{t.next}</button> : <span aria-disabled="true">{t.next}</span>}
    </nav>}
  </>;
}
