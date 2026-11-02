"use client";

import { Fragment, useState } from "react";
import { useApp } from "@/app/providers";
import type { Question } from "@/lib/pbt-api";
import { pbtContent } from "@/lib/pbt-content";

function Highlight({ text, highlight }: { text: string; highlight: string }) {
  if (!highlight || !text.includes(highlight)) return <>{text}</>;
  return <>{text.split(highlight).map((part, i) => <Fragment key={i}>{i > 0 && <u>{highlight}</u>}{part}</Fragment>)}</>;
}

export function QuestionMaterial({ question }: { question: Question }) {
  const { language } = useApp();
  const t = pbtContent[language];
  return <>
    {question.auxiliary && <div className="pbt-auxiliary" lang="ko">{question.auxiliary}</div>}
    {question.materialUrl ? <img className="pbt-material-image" src={question.materialUrl} alt={question.passage || t.material} />
      : question.passage && <div className="pbt-passage" lang="ko"><Highlight text={question.passage} highlight={question.highlight} /></div>}
  </>;
}

export function ListeningPlayer({ url }: { url: string }) {
  const { language } = useApp();
  const t = pbtContent[language];
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  return <div className="pbt-audio"><p>{t.audioHint}</p>
    <audio key={revision} controls preload="none" src={url} onError={() => setFailed(true)} aria-label={t.listening} />
    {failed && <p role="alert">{t.audioError} <button onClick={() => { setFailed(false); setRevision(n => n + 1); }}>{t.retry}</button></p>}
  </div>;
}

export default function PbtQuestion({ question, onAnswer, disabled, shared = false, review = false }: {
  question: Question; onAnswer?: (position: number, option: number | null) => void; disabled?: boolean; shared?: boolean; review?: boolean;
}) {
  const { language } = useApp();
  const t = pbtContent[language];
  return <article className="pbt-question" lang="ko">
    <h2><span className="pbt-question-number">{question.position}</span>{question.prompt}</h2>
    {!shared && <QuestionMaterial question={question} />}
    {shared && question.highlight && !question.passage.includes(question.highlight) && <p><u>{question.highlight}</u></p>}
    <fieldset className={`pbt-choices ${Object.keys(question.visuals).length ? "pbt-visual-choices" : ""}`} disabled={disabled || review}>
      <legend className="sr-only">{question.position}. {question.prompt}</legend>
      {question.choices.map((choice, i) => {
        const number = i + 1;
        return <label key={number} className={`pbt-choice ${question.selectedOption === number ? "is-selected" : ""} ${review && question.correctAnswer === number ? "is-correct" : ""} ${review && question.selectedOption === number && !question.isCorrect ? "is-wrong" : ""}`}>
          <input type="radio" name={`question-${question.position}`} value={number} checked={question.selectedOption === number} onChange={() => onAnswer?.(question.position, number)} />
          <span className="pbt-choice-number">{["①", "②", "③", "④"][i]}</span><span className="pbt-choice-content">
            {question.visuals[number] ? <img src={question.visuals[number]} alt={`${t.choice} ${number}`} /> : choice}
          </span>{review && question.correctAnswer === number && <span className="pbt-correct-label">{t.correct}</span>}
        </label>;
      })}
    </fieldset>
    {!review && question.selectedOption !== null && <button className="pbt-clear" type="button" disabled={disabled} onClick={() => onAnswer?.(question.position, null)}>{t.clear}</button>}
    {review && <div className="pbt-explanation">
      <p><strong>{t.yourAnswer}: {question.selectedOption ?? t.noAnswer}</strong><span>{t.correct}: {question.correctAnswer}</span></p>
      <h3>{t.explanation}</h3><div>{question.explanation}</div>
      {question.transcript && <details><summary>{t.transcript}</summary><p>{question.transcript}</p></details>}
    </div>}
  </article>;
}
