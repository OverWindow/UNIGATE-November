"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { VocabularyError, vocabularyRequest, type MeaningLanguage, type VocabularyAnswer,
  type VocabularyQuestion, type VocabularyQuiz as QuizData } from "@/lib/vocabulary-api";
import { vocabularyContent } from "@/lib/vocabulary-content";

export default function VocabularyQuiz({ id }: { id: string }) {
  const { language } = useApp();
  const t = vocabularyContent[language];
  const [data, setData] = useState<QuizData | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [questions, setQuestions] = useState<VocabularyQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answer, setAnswer] = useState<VocabularyAnswer | null>(null);
  const [wrong, setWrong] = useState<VocabularyQuestion[]>([]);
  const [reviewing, setReviewing] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<unknown>(null);
  const [meaningLanguage, setMeaningLanguage] = useState<MeaningLanguage>("en");
  const submission = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null); setQuestions([]); setIndex(0); setSelected(null);
    setAnswer(null); setWrong([]); setReviewing(false); setCheckError(null); setChecking(false);
    if (!/^[1-9]\d{0,18}$/.test(id)) {
      setError(new VocabularyError("not_found", 404));
      return;
    }
    void vocabularyRequest<QuizData>(`sets/${id}/questions/`, controller.signal).then(result => {
      if (!controller.signal.aborted) { setData(result); setQuestions(result.questions); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause); });
    return () => { controller.abort(); submission.current?.abort(); submission.current = null; };
  }, [id, revision]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }, [index, questions]);

  const question = questions[index];
  const finished = questions.length > 0 && index === questions.length;
  const changed = checkError instanceof VocabularyError && [404, 409].includes(checkError.status);
  const backHref = data ? `/vocabulary?level=${data.level}&page=${data.catalogPage}` : "/vocabulary";

  async function check() {
    if (selected === null || !question || answer || submission.current || changed) return;
    const controller = new AbortController();
    submission.current = controller;
    setChecking(true); setCheckError(null);
    try {
      const result = await vocabularyRequest<VocabularyAnswer>(`sets/${id}/questions/${question.id}/check/`,
        controller.signal, { selectedOption: selected, version: question.version });
      if (controller.signal.aborted) return;
      setAnswer(result);
      if (!result.isCorrect) setWrong(previous => [...previous, question]);
    } catch (cause) {
      if (!controller.signal.aborted) setCheckError(cause);
    } finally {
      if (submission.current === controller) { submission.current = null; setChecking(false); }
    }
  }

  function next() {
    setIndex(value => value + 1); setSelected(null); setAnswer(null); setCheckError(null);
  }

  function retryWrong() {
    setQuestions(wrong); setWrong([]); setIndex(0); setSelected(null); setAnswer(null);
    setCheckError(null); setReviewing(true);
  }

  return <div className="page-container vocabulary-quiz">
    <div className="vocabulary-study-top">
      <Link className="vocabulary-back" href={backHref}><ArrowLeft size={14} aria-hidden="true" /> {t.back}</Link>
    </div>
    <header className="vocabulary-quiz-header">
      <h1>{t.quizTitle}</h1>
    </header>
    {error ? <div className="vocabulary-status" role="alert">
      <p>{error instanceof VocabularyError && error.status === 404 ? t.notFound : t.quizError}</p>
      <button className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
    </div> : !data ? <p className="vocabulary-status" role="status">{t.quizLoading}</p>
      : !questions.length ? <div className="vocabulary-status"><p>{t.quizEmpty}</p><Link className="button vocabulary-secondary" href={`/vocabulary/sets/${id}`}>{t.browse}</Link></div>
      : finished ? <section className="vocabulary-quiz-result" aria-labelledby="quiz-result">
        <h2 id="quiz-result" ref={heading} tabIndex={-1}>{reviewing ? t.reviewResult : t.quizResult}</h2>
        <p className="vocabulary-quiz-score"><strong>{questions.length - wrong.length}</strong> / {questions.length}<span>{t.correctCount}</span></p>
        {!wrong.length && <p>{t.allCorrect}</p>}
        <div className="vocabulary-quiz-actions">
          {!!wrong.length && <button className="button button-primary" onClick={retryWrong}><RotateCcw size={16} aria-hidden="true" /> {t.retryWrong} ({wrong.length})</button>}
          <button className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.quizRestart}</button>
          <Link className="button vocabulary-secondary" href={`/vocabulary/sets/${id}`}>{t.browse}</Link>
        </div>
      </section> : <>
        <div className="vocabulary-quiz-progress">
          <span>{reviewing ? t.reviewing : t.question} <strong>{index + 1} / {questions.length}</strong></span>
          <div className="vocabulary-quiz-progress-track" role="progressbar" aria-label={t.quizTitle} aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={index}>
            <span style={{ width: `${index / questions.length * 100}%` }} />
          </div>
        </div>
        {!reviewing && questions.length < data.wordCount && <p className="vocabulary-quiz-note">{t.quizPartial}</p>}
        <form className="vocabulary-quiz-card" onSubmit={event => { event.preventDefault(); void check(); }}>
          <h2 ref={heading} tabIndex={-1} className="vocabulary-quiz-instruction" lang="ko">{question.instruction}</h2>
          <p className="vocabulary-quiz-stem" lang="ko">{question.stem}</p>
          <fieldset className="vocabulary-quiz-choices" disabled={checking || !!answer || changed}>
            <legend className="sr-only">{t.yourAnswer}</legend>
            {question.choices.map((choice, position) => {
              const option = position + 1;
              const correct = answer?.correctAnswer === option;
              const incorrect = !!answer && selected === option && !correct;
              return <label key={`${question.id}:${option}`} className={`vocabulary-quiz-choice${correct ? " is-correct" : incorrect ? " is-incorrect" : ""}`}>
                <input type="radio" name="quiz-choice" value={option} checked={selected === option} onChange={() => setSelected(option)} />
                <span className="vocabulary-quiz-option-number" aria-hidden="true">{option}</span><span lang="ko">{choice}</span>
                {(correct || incorrect) && <span className="vocabulary-quiz-choice-status">{correct ? t.correctAnswer : t.yourAnswer}</span>}
              </label>;
            })}
          </fieldset>
          {checkError != null && <div className="vocabulary-quiz-error" role="alert"><p>{changed ? t.questionChanged : t.checkError}</p>
            {changed && <button type="button" className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.quizRestart}</button>}
          </div>}
          <div aria-live="polite">
            {answer && <section className={`vocabulary-quiz-feedback${answer.isCorrect ? " is-correct" : ""}`}>
              <h3>{answer.isCorrect ? t.correct : t.incorrect}</h3>
              <h4>{t.correctAnswer}</h4><p lang="ko">{answer.correctAnswer}. {question.choices[answer.correctAnswer - 1]}</p>
              <h4>{t.explanation}</h4><p lang="ko">{answer.explanation}</p>
              <div className="vocabulary-toolbar"><strong lang="ko">{answer.word.korean}</strong>
                <label>{t.meaningLanguage}<select value={meaningLanguage} onChange={event => setMeaningLanguage(event.target.value as MeaningLanguage)}>
                  <option value="en" lang="en">English</option><option value="vi" lang="vi">Tiếng Việt</option><option value="ja" lang="ja">日本語</option>
                  <option value="zh-Hans" lang="zh-Hans">中文（简体）</option><option value="id" lang="id">Bahasa Indonesia</option>
                </select></label>
              </div>
              <p lang={answer.word.meanings[meaningLanguage]?.trim() ? meaningLanguage : language}>{answer.word.meanings[meaningLanguage]?.trim() || t.missingMeaning}</p>
            </section>}
          </div>
          <div className="vocabulary-quiz-actions">
            {answer ? <button type="button" className="button button-primary" onClick={next}>{index === questions.length - 1 ? t.showResult : t.next}<ArrowRight size={16} aria-hidden="true" /></button>
              : <button type="submit" className="button button-primary" disabled={selected === null || checking || changed}>{checking ? t.checking : t.checkAnswer}</button>}
          </div>
        </form>
      </>}
  </div>;
}
