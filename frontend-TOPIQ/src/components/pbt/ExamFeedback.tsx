"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/app/providers";
import { pbtRequest, PbtError, type Attempt, type FeedbackState } from "@/lib/pbt-api";
import { emptySurvey, surveyCopy, surveyErrors } from "@/lib/exam-survey";
import { examCopy, pbtErrorMessage } from "@/lib/pbt-content";
import type { ExamFormat } from "@/lib/exam-content";
import SiteHeader from "../SiteHeader";
import LearnerSurveyForm from "./LearnerSurveyForm";
import StarRating from "./StarRating";

export default function ExamFeedback({ id, examFormat }: { id: string; examFormat: ExamFormat }) {
  const { language, status, user } = useApp();
  const t = surveyCopy[language];
  const p = examCopy(language, examFormat);
  const router = useRouter();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState>({ completed: false });
  const [survey, setSurvey] = useState(emptySurvey);
  const [email, setEmail] = useState("");
  const [rating, setRating] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [now, setNow] = useState(0);
  const submitting = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const base = `/${examFormat}/attempts/${id}`;

  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    setAttempt(null); setError(null);
    void pbtRequest<Attempt>(`attempts/${id}/`, "GET", undefined, examFormat).then(data => {
      if (!active) return;
      if (data.status !== "submitted") { router.replace(base); return; }
      if (!data.guestAttempt) { router.replace(`${base}/result`); return; }
      setAttempt(data); setFeedback(data.feedback || { completed: false }); setRating(data.feedback?.rating || 0);
    }).catch(cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [id, examFormat, base, status, user?.id, revision, router]);
  const retryAt = Math.max(waitUntil, feedback.retryAt ? Date.parse(feedback.retryAt) : 0);
  useEffect(() => {
    setNow(Date.now());
    if (retryAt <= Date.now()) return;
    const timer = window.setInterval(() => {
      const time = Date.now(); setNow(time);
      if (time >= retryAt) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const remaining = Math.max(0, Math.ceil((retryAt - now) / 1000));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const invalid: string[] = [];
    if (!rating) invalid.push("rating");
    if (!email.trim() || !form.current?.querySelector<HTMLInputElement>("[name=email]")?.validity.valid) invalid.push("email");
    if (!feedback.completed) invalid.push(...surveyErrors(survey));
    setErrors(invalid); setError(null);
    if (invalid.length) {
      window.requestAnimationFrame(() => form.current?.querySelector<HTMLElement>(`[name="${invalid[0]}"]`)?.focus());
      return;
    }
    submitting.current = true; setPending(true);
    try {
      const result = await pbtRequest<{ feedback: FeedbackState }>(`attempts/${id}/result-email/`, "POST", {
        email: email.trim(), rating, language, ...(!feedback.completed ? { survey } : {}),
      }, examFormat);
      setFeedback(result.feedback); setEditing(false);
    } catch (cause) {
      setError(cause);
      if (cause instanceof PbtError) {
        setErrors(cause.fields);
        if (cause.feedback) setFeedback(cause.feedback);
        if (cause.retryAfter) setWaitUntil(Date.now() + cause.retryAfter * 1000);
      }
      // A lost delivery response must not force the learner to repeat a committed survey.
      try {
        const latest = await pbtRequest<Attempt>(`attempts/${id}/`, "GET", undefined, examFormat);
        if (latest.feedback) setFeedback(latest.feedback);
      } catch { /* Preserve the original error and form input. */ }
    } finally { submitting.current = false; setPending(false); }
  }
  const code = error instanceof PbtError ? error.code : "";
  const message = code === "result_email_failed" ? t.failed : code === "result_email_uncertain" ? t.uncertain
    : code === "result_email_rate_limited" ? t.limited : ["invalid_survey", "survey_required", "validation_error"].includes(code) ? t.invalid : pbtErrorMessage(error, p);
  const accepted = feedback.emailStatus === "accepted" && !editing;
  return <><SiteHeader /><main className="exam-feedback-main" id="main-content" tabIndex={-1}>
    <Link className="text-link" href={`/${examFormat}`}>← {t.back}</Link>
    {!attempt ? <div className="exam-feedback-card">{error ? <><p role="alert">{message}</p><p>{t.sessionHelp}</p><button className="button button-primary" onClick={() => setRevision(n => n + 1)}>{p.retry}</button></> : <p role="status">{p.loading}</p>}</div>
      : accepted ? <section className="exam-feedback-card exam-feedback-receipt" aria-live="polite">
        <p className="eyebrow">TOPIQ · {examFormat.toUpperCase()}</p><h1>{t.sentTitle}</h1><p>{t.sent}</p><strong className="exam-masked-email">{feedback.maskedEmail}</strong>
        {feedback.expiresAt && <p>{t.expiry}: {new Date(feedback.expiresAt).toLocaleDateString(language)}</p>}
        <p className="pbt-muted">{t.resendHint}</p><button className="button button-primary" onClick={() => { setEditing(true); setError(null); }}>{t.resend}</button>
      </section> : <form ref={form} className="exam-feedback-card" noValidate onSubmit={submit}>
        <p className="eyebrow">{attempt.title} · {p[attempt.section]} · {p[attempt.mode]}</p><h1>{t.title}</h1><p>{t.description}</p>
        <fieldset className="exam-feedback-controls" disabled={pending}>
          <StarRating value={rating} onChange={value => { setRating(value); setErrors(current => current.filter(name => name !== "rating")); }} language={language} invalid={errors.includes("rating")} />
          <div className="exam-survey-field"><label htmlFor="result-email">{t.email} <small>({t.required})</small></label>
            <input id="result-email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="name@example.com" value={email} onChange={event => { setEmail(event.target.value); setErrors(current => current.filter(name => name !== "email")); }} aria-invalid={errors.includes("email")} aria-describedby={errors.includes("email") ? "email-error" : undefined} />
            {errors.includes("email") && <p className="exam-field-error" id="email-error">{t.fieldError}</p>}
          </div>
          {feedback.completed ? <p className="pbt-muted">{t.resendHint}</p> : <LearnerSurveyForm value={survey} onChange={value => {
            setSurvey(value);
            const invalid = surveyErrors(value);
            setErrors(current => current.filter(name => name === "rating" || name === "email" || invalid.includes(name)));
          }} language={language} errors={errors} />}
          {(error || errors.length > 0) && <p className="pbt-alert" role="alert">{error ? message : t.invalid}</p>}
          {!error && ["failed", "uncertain", "sending"].includes(feedback.emailStatus || "") && <p role="status" className="pbt-alert">{feedback.emailStatus === "failed" ? t.failed : t.uncertain}</p>}
          {remaining > 0 && <p role="status">{remaining} {t.seconds}</p>}
          <button className="button button-primary exam-feedback-submit" type="submit" disabled={pending || remaining > 0} aria-busy={pending}>{pending ? t.submitting : t.submit}</button>
        </fieldset>
      </form>}
  </main></>;
}
