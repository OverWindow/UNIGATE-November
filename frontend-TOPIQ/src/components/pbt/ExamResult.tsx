"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import type { ExamFormat } from "@/lib/exam-content";
import { pbtRequest, PbtError } from "@/lib/pbt-api";
import { surveyCopy } from "@/lib/exam-survey";
import { examCopy, pbtErrorMessage } from "@/lib/pbt-content";
import type { Language } from "@/lib/landing-content";
import PbtAttempt from "./PbtAttempt";
import SiteHeader from "../SiteHeader";

export default function ExamResult({ id, examFormat }: { id: string; examFormat: ExamFormat }) {
  const { language, setLanguage, status } = useApp();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const token = useRef<string | null>(null);
  const request = useRef<Promise<{ language: Language }> | null>(null);
  const t = surveyCopy[language];
  const p = examCopy(language, examFormat);
  useEffect(() => {
    if (status === "loading") return;
    let active = true;
    token.current ||= new URLSearchParams(window.location.hash.slice(1)).get("token");
    if (!token.current) { setReady(true); return; }
    // Remove the credential from the address bar while retaining it in memory for a network retry.
    window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    request.current ||= pbtRequest<{ language: Language }>("result-access/", "POST", { attemptId: id, token: token.current }, examFormat);
    void request.current.then(data => { if (active) { setLanguage(data.language); setReady(true); } })
      .catch(cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [id, examFormat, revision, setLanguage, status]);
  if (ready) return <PbtAttempt id={id} review examFormat={examFormat} />;
  const code = error instanceof PbtError ? error.code : "";
  return <><SiteHeader /><main id="main-content" className="exam-feedback-main" tabIndex={-1}><div className="exam-feedback-card">
    <h1>{t.checking}</h1>
    {error ? <><p role="alert">{code === "result_link_invalid" ? t.linkInvalid : code === "result_link_expired" ? t.linkExpired : pbtErrorMessage(error, p)}</p>
      {!["result_link_invalid", "result_link_expired"].includes(code) && <button className="button button-primary" onClick={() => { request.current = null; setError(null); setRevision(n => n + 1); }}>{p.retry}</button>}
      <p>{t.sessionHelp}</p><Link className="text-link" href={`/${examFormat}/attempts/${id}/feedback`}>{t.requestAgain}</Link>
    </> : <p role="status">{p.loading}</p>}
  </div></main></>;
}
