"use client";

import { ChevronDown } from "lucide-react";
import { useApp } from "@/app/providers";
import type { Evaluation } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import { visibleReviewReasons, writingScoreLimits, writingTaskLabel } from "@/lib/writing-result";

export default function WritingResult({ entry, correctionId, activeCorrection }: {
  entry: Evaluation; correctionId: string; activeCorrection: number | null;
}) {
  const { language } = useApp();
  const t = evaluationContent[language];
  const result = entry.result;
  const reviewReasons = visibleReviewReasons(result?.review_reasons ?? []);
  const scoreLimits = writingScoreLimits[entry.typeSlot];
  const labels: Record<string, string> = { a: "㉠", b: "㉡", content: "내용 및 수행 과제", organization: "글의 전개 구조", language: "언어 사용" };
  const shortLabels: Record<string, string> = { a: "㉠", b: "㉡", content: "내용·과제", organization: "구성", language: "언어" };
  return <section className="writing-evaluation-result" aria-label={t.result}>
    {entry.status === "failed" && <p className="writing-result-status" role="status">{t.failed}</p>}
    {result && <div lang="ko">
      <p className="writing-result-summary">{result.summary}</p>
      <details className="writing-score-details">
        <summary title={t.details}>
          <span className="writing-scores">{Object.entries(result.scores).map(([key, score]) => <span key={key}>
            <span title={labels[key]} aria-label={labels[key]}>{shortLabels[key]}</span>
            <span><strong>{score.score}</strong><span> / {scoreLimits?.[key] ?? "—"}</span></span>
          </span>)}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="writing-score-rationales">{Object.entries(result.scores).map(([key, score]) => <section key={key}>
          <h4>{labels[key]}</h4><p>{score.rationale}</p>
          {score.quotes.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}
        </section>)}</div>
      </details>
      <h3 lang={language}>{t.tasks}</h3><ul className="writing-task-list">{result.task_checks.map((check, index) => <li key={check.requirement_id}>
        <div className="writing-task-heading"><span className="writing-task-status" data-status={check.status}>{check.status}</span>
          <span>{writingTaskLabel(check.requirement_id, entry.question) ?? `${t.tasks} ${index + 1}`}</span></div>
        {check.status !== "충족" && <div className="writing-task-reason"><p>{check.reason}</p>
          {check.quotes.map((quote, quoteIndex) => <blockquote key={quoteIndex}>{quote}</blockquote>)}</div>}
      </li>)}</ul>
      {result.corrections.length > 0 && <section className="writing-corrections">
        <h3 lang={language}>{t.corrections}</h3>
        <ol className="writing-correction-list">{result.corrections.map((correction, index) =>
          <li key={index} id={`${correctionId}-${index}`} tabIndex={-1} data-active={activeCorrection === index || undefined}>
            <span className="writing-correction-number" aria-hidden="true">{index + 1}</span>
            <div className="writing-correction-comparison">
              <div><span lang={language}>{t.before}</span><p><del>{correction.original}</del></p></div>
              <div><span lang={language}>{t.after}</span><p><ins>{correction.suggestion}</ins></p></div>
            </div>
            <p className="writing-correction-reason">{correction.reason}</p>
          </li>)}</ol>
      </section>}
      {reviewReasons.length > 0 && <><h3 lang={language}>{t.review}</h3><ul>{reviewReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></>}
    </div>}
  </section>;
}
