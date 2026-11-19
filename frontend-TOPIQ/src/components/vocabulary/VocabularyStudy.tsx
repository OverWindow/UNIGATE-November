"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createExampleAnalyzer } from "@/lib/vocabulary/vocabulary-analysis";
import { useApp } from "@/app/providers";
import { VocabularyError, vocabularyRequest, type MeaningLanguage, type VocabularyDetail } from "@/lib/vocabulary/vocabulary-api";
import { vocabularyContent } from "@/lib/vocabulary/vocabulary-content";
import VocabularyAudio from "./VocabularyAudio";
import VocabularyExample from "./VocabularyExample";

export default function VocabularyStudy({ id }: { id: string }) {
  const { language } = useApp();
  const t = vocabularyContent[language];
  const [data, setData] = useState<VocabularyDetail | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [meaningLanguage, setMeaningLanguage] = useState<MeaningLanguage>("en");
  const [listOpen, setListOpen] = useState(false);
  const analyzer = useRef<ReturnType<typeof createExampleAnalyzer> | null>(null);
  const cardColumn = useRef<HTMLDivElement>(null);
  const meaningRegion = useRef<HTMLDivElement>(null);
  const wordList = useRef<HTMLOListElement>(null);

  useEffect(() => {
    analyzer.current = createExampleAnalyzer();
    return () => { analyzer.current?.dispose(); analyzer.current = null; };
  }, [id]);

  useEffect(() => {
    let active = true;
    setData(null); setError(null); setIndex(0); setRevealed(false);
    if (!/^[1-9]\d{0,18}$/.test(id)) {
      setError(new VocabularyError("not_found", 404));
      return;
    }
    const controller = new AbortController();
    void vocabularyRequest<VocabularyDetail>(`sets/${id}/`, controller.signal).then(result => {
      if (active) setData(result);
    }).catch(cause => { if (active) setError(cause); });
    return () => { active = false; controller.abort(); };
  }, [id, revision]);

  useEffect(() => {
    meaningRegion.current?.scrollTo({ top: 0, behavior: "instant" });
    const column = cardColumn.current;
    if (column && (column.getBoundingClientRect().top < 0 || column.getBoundingClientRect().top >= window.innerHeight)) {
      column.scrollIntoView({ block: "start", behavior: "instant" });
    }
  }, [index, data]);

  useEffect(() => {
    const list = wordList.current;
    const selected = list?.querySelector<HTMLButtonElement>('[aria-current="true"]');
    if (!list?.clientHeight || !selected) return;
    const bounds = list.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    const offset = item.top < bounds.top ? item.top - bounds.top - 8
      : item.bottom > bounds.bottom ? item.bottom - bounds.bottom + 8 : 0;
    list.scrollBy({ top: offset, behavior: "instant" });
  }, [index, data, listOpen]);

  useEffect(() => {
    if (revealed) meaningRegion.current?.focus({ preventScroll: true });
  }, [revealed]);

  function move(next: number) {
    setIndex(next); setRevealed(false); setListOpen(false);
  }

  const backHref = data ? `/vocabulary?level=${data.level}&page=${data.catalogPage}` : "/vocabulary";
  const word = data?.words[index];
  const meaning = word?.meanings[meaningLanguage]?.trim();
  return <div className="vocabulary-study">
    {error ? <div className="page-container vocabulary-status vocabulary-error" role="alert">
      <p>{error instanceof VocabularyError && error.status === 404 ? t.notFound : t.error}</p>
      <button className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
    </div> : !data || !word ? <p className="page-container vocabulary-status" role="status">{t.loading}</p> : <>
      <div className="page-container vocabulary-study-grid">
        <aside className="vocabulary-word-list">
          <h2 className="vocabulary-list-title">{t.wordList}</h2>
          <button className="vocabulary-list-toggle" aria-expanded={listOpen} aria-controls="vocabulary-words" onClick={() => setListOpen(!listOpen)}>{t.wordList}<span aria-hidden="true">{listOpen ? <Minus size={16} /> : <Plus size={16} />}</span></button>
          <ol ref={wordList} id="vocabulary-words" className={listOpen ? "is-open" : ""} aria-label={t.wordList}>
            {data.words.map((entry, position) => <li key={entry.id}>
              <button aria-current={index === position ? "true" : undefined} onClick={() => move(position)}><span>{position + 1}</span><span lang="ko">{entry.korean}</span></button>
            </li>)}
          </ol>
        </aside>
        <div ref={cardColumn} className="vocabulary-card-column">
          <div className="vocabulary-toolbar">
            <p aria-live="polite">{t.currentWord} <strong>{index + 1} / {data.wordCount}</strong></p>
            <label>{t.meaningLanguage}<select value={meaningLanguage} onChange={event => setMeaningLanguage(event.target.value as MeaningLanguage)}>
              <option value="en" lang="en">English</option><option value="vi" lang="vi">Tiếng Việt</option><option value="ja" lang="ja">日本語</option>
              <option value="zh-Hans" lang="zh-Hans">中文（简体）</option><option value="id" lang="id">Bahasa Indonesia</option>
            </select></label>
          </div>
          <article className="vocabulary-word-card" aria-labelledby="vocabulary-word">
            <div className="vocabulary-word-front">
              <VocabularyAudio key={`${word.id}:${word.audioUrl ?? ""}`} word={word.korean} url={word.audioUrl} partOfSpeech={word.partOfSpeech} />
            </div>
            <div className={`vocabulary-reveal-area${revealed ? " is-revealed" : ""}`}>
              <button className="button vocabulary-reveal" aria-expanded={revealed} aria-controls="vocabulary-meaning"
                aria-hidden={revealed} tabIndex={revealed ? -1 : 0} disabled={revealed} onClick={() => setRevealed(true)}>{t.showMeaning}</button>
              <div ref={meaningRegion} id="vocabulary-meaning" className={`vocabulary-meaning-region${revealed ? " is-open" : ""}`}
                role="region" aria-label={t.showMeaning} tabIndex={-1} aria-hidden={!revealed} inert={!revealed}>
                <p className="vocabulary-definition"><span className="vocabulary-definition-label">{t.meaning} :</span>
                  <span lang={meaning ? meaningLanguage : language}>{meaning || t.missingMeaning}</span></p>
                <div className="vocabulary-example">
                  {revealed ? <VocabularyExample key={`${word.id}:${word.exampleKorean}`} wordId={word.id} text={word.exampleKorean}
                    analyzer={analyzer.current!} meaningLanguage={meaningLanguage} reload={() => setRevision(value => value + 1)} /> : <p lang="ko">{word.exampleKorean}</p>}
                  <p className="vocabulary-example-translation" lang="en">{word.exampleEnglish}</p></div>
              </div>
            </div>
          </article>
          <nav className="vocabulary-card-navigation" aria-label={t.wordList}>
            <button className="button vocabulary-secondary" disabled={index === 0} onClick={() => move(index - 1)}><ArrowLeft size={16} aria-hidden="true" /> {t.previous}</button>
            {index < data.words.length - 1 ? <button className="button button-primary" onClick={() => move(index + 1)}>{t.next} <ArrowRight size={16} aria-hidden="true" /></button>
              : data.quizQuestionCount ? <Link className="button button-primary" href={`/vocabulary/sets/${id}/quiz`}>{t.quiz} <ArrowRight size={16} aria-hidden="true" /></Link>
                : <Link className="button button-primary" href={backHref}>{t.back} <ArrowRight size={16} aria-hidden="true" /></Link>}
          </nav>
          {index === data.words.length - 1 && <p className="vocabulary-end">{t.lastWord} <button onClick={() => move(0)}>{t.firstWord}</button></p>}
          {index === data.words.length - 1 && !data.quizQuestionCount && <p className="vocabulary-end">{data.quizQuestionCount === null ? t.quizUnavailable : t.quizPreparing}</p>}
        </div>
      </div>
    </>}
  </div>;
}
