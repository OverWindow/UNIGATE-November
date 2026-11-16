"use client";

import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { useApp } from "@/app/providers";
import type { Evaluation } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import { correctionSegments, visibleReviewReasons, writingScoreLimits } from "@/lib/writing-result";
import WritingMaterial from "./WritingMaterial";

export default function WritingResult({ entry, showQuestion = false }: { entry: Evaluation; showQuestion?: boolean }) {
  const { language } = useApp();
  const t = evaluationContent[language];
  const result = entry.result;
  const correctionId = useId();
  const reviewReasons = visibleReviewReasons(result?.review_reasons ?? []);
  const scoreLimits = writingScoreLimits[entry.typeSlot];
  const labels: Record<string, string> = { a: "㉠", b: "㉡", content: "내용 및 수행 과제", organization: "글의 전개 구조", language: "언어 사용" };
  return <section className="writing-evaluation-result" aria-label={t.result}>
    <h2>{entry.typeSlot} · {t.result}</h2>
    {entry.totalScore !== null ? <div className="writing-score-summary" role="status">
      <div><p className="writing-score-status">{t.succeeded}</p><span>{t.totalScore}</span></div>
      <p className="writing-total-score"><strong>{entry.totalScore}</strong><span>/ {entry.maxScore} {t.points}</span></p>
    </div> : <p className="writing-result-status" role="status">
      {entry.status === "processing" && <span className="writing-spinner" aria-hidden="true" />}{t[entry.status]}
    </p>}
    <p className="writing-charged">{t.charged}: {entry.chargedCredits} {t.credits}</p>
    {showQuestion && entry.question && <details className="writing-saved-question"><summary>{t.savedQuestion}</summary><div lang="ko">
      <p>{entry.question.instruction}</p><h3>{entry.question.context_title}</h3><p className="writing-original">{entry.question.passage}</p>
      {entry.typeSlot === 53 && entry.question.image_url
        ? <img className="writing-material-image" src={entry.question.image_url} alt={`${entry.question.topic} 자료`} />
        : entry.question.materials.map((material, index) => <WritingMaterial key={index} material={material} language={language} />)}
      <ul>{[...entry.question.material_notes, ...entry.question.requirements].map((text, index) => <li key={index}>{text}</li>)}</ul>
      {entry.question.data_source && <p>{entry.question.data_source}</p>}
    </div></details>}
    {entry.answer && <details open={!result?.corrections.length}><summary>{t.original}</summary>{Object.entries(entry.answer).map(([key, value]) =>
      <div key={key}><h3>{labels[key] ?? t.answer}</h3><p className="writing-original" lang="ko">{value || "—"}</p></div>)}</details>}
    {result && <div lang="ko">
      <p className="writing-result-summary">{result.summary}</p>
      <div className="writing-scores">{Object.entries(result.scores).map(([key, score]) => <section key={key}>
        <div className="writing-criterion-heading"><h3>{labels[key]}</h3>
          <p><strong>{score.score}</strong><span> / {scoreLimits?.[key] ?? "—"} <span lang={language}>{t.points}</span></span></p>
        </div>
        {entry.typeSlot === 54 ? <>
          <progress className="writing-score-progress" value={score.score} max={scoreLimits[key]} aria-label={labels[key]} />
          <details className="writing-score-details"><summary lang={language}>{t.details}<ChevronDown size={16} aria-hidden="true" /></summary>
            <div><p>{score.rationale}</p>{score.quotes.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}</div>
          </details>
        </> : <><p>{score.rationale}</p>{score.quotes.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}</>}
      </section>)}</div>
      <h3 lang={language}>{t.tasks}</h3><ul>{result.task_checks.map(check => <li key={check.requirement_id}>
        <strong>{check.status}</strong> · {check.reason}{check.quotes.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}
      </li>)}</ul>
      {result.corrections.length > 0 && <section className="writing-corrections">
        <h3 lang={language}>{t.corrections}</h3>
        {entry.answer && <div className="writing-correction-context">
          <h4 lang={language}>{t.correctionContext}</h4><p className="writing-correction-hint" lang={language}>{t.correctionHint}</p>
          {Object.entries(entry.answer).map(([key, value]) => <div key={key}>
            {key !== "text" && <h4>{labels[key]}</h4>}
            <p className="writing-original">{value ? correctionSegments(value, result.corrections).map((segment, index) =>
              segment.corrections.length ? <mark className="writing-correction-mark" key={index}>{segment.text}<sup>{segment.corrections.map(number =>
                <a key={number} href={`#${correctionId}-${number}`} aria-label={`${t.corrections} ${number + 1}`}>{number + 1}</a>)}</sup></mark> : segment.text) : "—"}</p>
          </div>)}
        </div>}
        <ol className="writing-correction-list">{result.corrections.map((correction, index) =>
          <li key={index} id={`${correctionId}-${index}`} tabIndex={-1}>
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
