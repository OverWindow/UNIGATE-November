"use client";

import { useApp } from "@/app/providers";
import type { Evaluation } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import WritingMaterial from "./WritingMaterial";

export default function WritingResult({ entry, showQuestion = false }: { entry: Evaluation; showQuestion?: boolean }) {
  const { language } = useApp();
  const t = evaluationContent[language];
  const result = entry.result;
  const labels: Record<string, string> = { a: "㉠", b: "㉡", content: "내용 및 과제 수행", organization: "글의 전개 구조", language: "언어 사용" };
  return <section className="writing-evaluation-result" aria-label={t.result}>
    <h2>{entry.typeSlot} · {t.result}</h2>
    <p role="status">{t[entry.status]}{entry.totalScore !== null && <strong> · {entry.totalScore} / {entry.maxScore}</strong>}</p>
    <p>{t.charged}: {entry.chargedCredits} {t.credits}</p>
    {showQuestion && entry.question && <details className="writing-saved-question"><summary>{t.savedQuestion}</summary><div lang="ko">
      <p>{entry.question.instruction}</p><h3>{entry.question.context_title}</h3><p className="writing-original">{entry.question.passage}</p>
      {entry.question.materials.map((material, index) => <WritingMaterial key={index} material={material} language={language} />)}
      <ul>{[...entry.question.material_notes, ...entry.question.requirements].map((text, index) => <li key={index}>{text}</li>)}</ul>
      {entry.question.data_source && <p>{entry.question.data_source}</p>}
    </div></details>}
    {entry.answer && <details open><summary>{t.original}</summary>{Object.entries(entry.answer).map(([key, value]) =>
      <div key={key}><h3>{labels[key] ?? t.answer}</h3><p className="writing-original" lang="ko">{value || "—"}</p></div>)}</details>}
    {result && <div lang="ko">
      <p className="writing-result-summary">{result.summary}</p>
      <div className="writing-scores">{Object.entries(result.scores).map(([key, score]) => <section key={key}>
        <h3>{labels[key]} · {score.score}</h3><p>{score.rationale}</p>
        {score.quotes.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}
      </section>)}</div>
      <h3 lang={language}>{t.tasks}</h3><ul>{result.task_checks.map(check => <li key={check.requirement_id}>
        <strong>{check.status}</strong> · {check.reason}{check.quotes.map((quote, index) => <blockquote key={index}>{quote}</blockquote>)}
      </li>)}</ul>
      {result.corrections.length > 0 && <><h3 lang={language}>{t.corrections}</h3><ul>{result.corrections.map((correction, index) =>
        <li key={index}><del>{correction.original}</del> → <ins>{correction.suggestion}</ins><p>{correction.reason}</p></li>)}</ul></>}
      {result.review_reasons.length > 0 && <><h3 lang={language}>{t.review}</h3><ul>{result.review_reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul></>}
    </div>}
  </section>;
}
