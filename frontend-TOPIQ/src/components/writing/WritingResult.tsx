"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { useApp } from "@/app/providers";
import type { Evaluation } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import { visibleReviewReasons, writingScoreLimits, writingTaskLabel } from "@/lib/writing-result";

export default function WritingResult({ entry, correctionId, activeCorrection, correctionsOpen, onToggleCorrections }: {
  entry: Evaluation; correctionId: string; activeCorrection: number | null;
  correctionsOpen: boolean; onToggleCorrections: () => void;
}) {
  const { language } = useApp();
  const t = evaluationContent[language];
  const result = entry.result;
  const prefix = useId();
  const [activeCriterion, setActiveCriterion] = useState<string | null>(null);
  const reviewReasons = visibleReviewReasons(result?.review_reasons ?? []);
  const scoreLimits = writingScoreLimits[entry.typeSlot];
  const scores = ["a", "b", "content", "organization", "language"].flatMap(key => {
    const score = result?.scores[key];
    return score ? [[key, score] as const] : [];
  });
  const labels: Record<string, string> = { a: "㉠", b: "㉡", content: "내용 및 수행 과제", organization: "글의 전개 구조", language: "언어 사용" };
  const shortLabels: Record<string, string> = { a: "㉠", b: "㉡", content: "내용 과제", organization: "구성", language: "언어" };
  return <section className="writing-evaluation-result" aria-label={t.result}>
    {entry.status === "failed" && <p className="writing-result-status" role="status">{t.failed}</p>}
    {result && <div lang="ko">
      <p className="writing-result-summary">{result.summary}</p>
      <div className="writing-score-details">
        <div className="writing-scores">{scores.map(([key, score]) => <button type="button" key={key}
          id={`${prefix}-score-${key}`} aria-expanded={activeCriterion === key} aria-controls={`${prefix}-feedback-${key}`}
          aria-label={`${labels[key]} ${score.score} / ${scoreLimits?.[key] ?? "—"} ${t.points}`}
          onClick={() => setActiveCriterion(previous => previous === key ? null : key)}>
            <span title={labels[key]} aria-label={labels[key]}>{shortLabels[key]}</span>
            <span><strong>{score.score}</strong><span> / {scoreLimits?.[key] ?? "—"}</span></span>
            <ChevronDown size={13} aria-hidden="true" />
            <progress className="writing-score-progress" value={score.score} max={scoreLimits?.[key]} aria-hidden="true" />
          </button>)}</div>
        {scores.map(([key, score]) => <div key={key} id={`${prefix}-feedback-${key}`}
          className="writing-reveal" data-open={activeCriterion === key} aria-hidden={activeCriterion !== key} inert={activeCriterion !== key}
          role="region" aria-labelledby={`${prefix}-score-${key}`}>
          <div><section className="writing-score-rationales"><h4>{labels[key]}</h4><p>{score.rationale}</p>
            {score.quotes.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}
          </section></div>
        </div>)}
      </div>
      {result.task_checks.length > 0 && <section className="writing-result-disclosure">
        <h3 className="writing-tasks-title" lang={language}>{t.tasks}<span className="writing-disclosure-count">{result.task_checks.length}</span></h3>
        <ul className="writing-task-list">{result.task_checks.map((check, index) => <li key={check.requirement_id}>
          <div className="writing-task-heading"><span className="writing-task-status" data-status={check.status}>{check.status}</span>
            <span>{writingTaskLabel(check.requirement_id, entry.question) ?? `${t.tasks} ${index + 1}`}</span></div>
          {check.status !== "충족" && <details className="writing-task-details">
            <summary lang={language}>{t.details}<ChevronDown size={13} aria-hidden="true" /></summary>
            <div className="writing-task-reason"><p>{check.reason}</p>
              {check.quotes.map((quote, quoteIndex) => <blockquote key={quoteIndex}>{quote}</blockquote>)}</div>
          </details>}
        </li>)}</ul>
      </section>}
      {result.corrections.length > 0 && <section className="writing-corrections">
        <h3><button type="button" className="writing-disclosure-trigger" lang={language} id={`${correctionId}-heading`}
          aria-expanded={correctionsOpen} aria-controls={`${correctionId}-panel`} onClick={onToggleCorrections}>
          <span>{t.corrections}<span className="writing-disclosure-count">{result.corrections.length}</span></span><ChevronDown size={15} aria-hidden="true" />
        </button></h3>
        <div id={`${correctionId}-panel`} className="writing-reveal" data-open={correctionsOpen} aria-hidden={!correctionsOpen} inert={!correctionsOpen}
          role="region" aria-labelledby={`${correctionId}-heading`}>
        <div><ol className="writing-correction-list">{result.corrections.map((correction, index) =>
          <li key={index} id={`${correctionId}-${index}`} tabIndex={-1} data-active={activeCorrection === index || undefined}>
            <span className="writing-correction-number" aria-hidden="true">{index + 1}</span>
            <div className="writing-correction-comparison">
              <div><span lang={language}>{t.before}</span><p><del>{correction.original}</del></p></div>
              <div><span lang={language}>{t.after}</span><p><ins>{correction.suggestion}</ins></p></div>
            </div>
            <p className="writing-correction-reason">{correction.reason}</p>
          </li>)}</ol></div>
        </div>
      </section>}
      {reviewReasons.length > 0 && <><h3 lang={language}>{t.review}</h3><ul>{reviewReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></>}
    </div>}
  </section>;
}
