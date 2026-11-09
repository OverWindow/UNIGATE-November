"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { VocabularyError, vocabularyRequest, type MeaningLanguage, type VocabularyDetail } from "@/lib/vocabulary-api";
import { vocabularyContent } from "@/lib/vocabulary-content";
import VocabularyAudio from "./VocabularyAudio";

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

  function move(next: number) {
    setIndex(next); setRevealed(false); setListOpen(false);
  }

  const backHref = data ? `/vocabulary?level=${data.level}&page=${data.catalogPage}` : "/vocabulary";
  const word = data?.words[index];
  const meaning = word?.meanings[meaningLanguage]?.trim();
  return <div className="page-container vocabulary-study">
    <div className="vocabulary-study-top">
      <Link className="vocabulary-back" href={backHref}><ArrowLeft size={14} aria-hidden="true" /> {t.back}</Link>
    </div>
    {error ? <div className="vocabulary-status vocabulary-error" role="alert">
      <p>{error instanceof VocabularyError && error.status === 404 ? t.notFound : t.error}</p>
      <button className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
    </div> : !data || !word ? <p className="vocabulary-status" role="status">{t.loading}</p> : <>
      <div className="vocabulary-study-grid">
        <aside className="vocabulary-word-list">
          <h2 className="vocabulary-list-title">{t.wordList}</h2>
          <button className="vocabulary-list-toggle" aria-expanded={listOpen} aria-controls="vocabulary-words" onClick={() => setListOpen(!listOpen)}>{t.wordList}<span aria-hidden="true">{listOpen ? <Minus size={16} /> : <Plus size={16} />}</span></button>
          <ol id="vocabulary-words" className={listOpen ? "is-open" : ""} aria-label={t.wordList}>
            {data.words.map((entry, position) => <li key={entry.id}>
              <button aria-current={index === position ? "true" : undefined} onClick={() => move(position)}><span>{position + 1}</span><span lang="ko">{entry.korean}</span></button>
            </li>)}
          </ol>
        </aside>
        <div className="vocabulary-card-column">
          <div className="vocabulary-toolbar">
            <p aria-live="polite">{t.currentWord} <strong>{index + 1} / {data.wordCount}</strong></p>
            <label>{t.meaningLanguage}<select value={meaningLanguage} onChange={event => setMeaningLanguage(event.target.value as MeaningLanguage)}>
              <option value="en" lang="en">English</option><option value="vi" lang="vi">Tiếng Việt</option><option value="ja" lang="ja">日本語</option>
              <option value="zh-Hans" lang="zh-Hans">中文（简体）</option><option value="id" lang="id">Bahasa Indonesia</option>
            </select></label>
          </div>
          <article className="vocabulary-word-card" aria-labelledby="vocabulary-word">
            <div className="vocabulary-word-front">
              <VocabularyAudio key={`${word.id}:${word.audioUrl ?? ""}`} word={word.korean} url={word.audioUrl} />
              {word.partOfSpeech && <span className="vocabulary-pos" lang="ko">{word.partOfSpeech}</span>}
              <button className="button vocabulary-reveal" aria-expanded={revealed} aria-controls="vocabulary-meaning" onClick={() => setRevealed(!revealed)}>{revealed ? t.hideMeaning : t.showMeaning}</button>
            </div>
            <div id="vocabulary-meaning" className={`vocabulary-meaning-region${revealed ? " is-open" : ""}`} aria-hidden={!revealed}>
              <div className="vocabulary-meaning-inner"><div className="vocabulary-word-meaning">
                <h3>{t.meaning}</h3><p className="vocabulary-definition" lang={meaning ? meaningLanguage : language}>{meaning || t.missingMeaning}</p>
                <div className="vocabulary-example"><h3>{t.example}</h3><p lang="ko">{word.exampleKorean}</p>
                  <h3>{t.englishExample}</h3><p lang="en">{word.exampleEnglish}</p></div>
              </div></div>
            </div>
          </article>
          <nav className="vocabulary-card-navigation" aria-label={t.wordList}>
            <button className="button vocabulary-secondary" disabled={index === 0} onClick={() => move(index - 1)}><ArrowLeft size={16} aria-hidden="true" /> {t.previous}</button>
            {index < data.words.length - 1 ? <button className="button button-primary" onClick={() => move(index + 1)}>{t.next} <ArrowRight size={16} aria-hidden="true" /></button>
              : <Link className="button button-primary" href={backHref}>{t.back} <ArrowRight size={16} aria-hidden="true" /></Link>}
          </nav>
          {index === data.words.length - 1 && <p className="vocabulary-end">{t.lastWord} <button onClick={() => move(0)}>{t.firstWord}</button></p>}
        </div>
      </div>
    </>}
  </div>;
}
