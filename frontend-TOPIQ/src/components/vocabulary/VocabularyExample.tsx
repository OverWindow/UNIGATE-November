"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "@/app/providers";
import { vocabularyContent } from "@/lib/vocabulary-content";
import { VocabularyError, vocabularyRequest, type ExampleMeaning, type MeaningLanguage } from "@/lib/vocabulary-api";
import type { ExampleAnalysis, ExampleAnalyzer, ExampleSegment } from "@/lib/vocabulary-analysis";

type Selection = ExampleSegment & { trigger: HTMLButtonElement };

function MeaningPopup({ wordId, version, selection, meaningLanguage, close, reload }: {
  wordId: string; version: string; selection: Selection; meaningLanguage: MeaningLanguage;
  close: () => void; reload: () => void;
}) {
  const { language } = useApp();
  const t = vocabularyContent[language];
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const [data, setData] = useState<ExampleMeaning | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null);
    const params = new URLSearchParams({ start: String(selection.start), end: String(selection.end),
      surface: selection.text, candidates: JSON.stringify(selection.candidates), version, lang: meaningLanguage });
    void vocabularyRequest<ExampleMeaning>(`words/${wordId}/example-meaning/?${params}`, controller.signal)
      .then(result => { if (!controller.signal.aborted) setData(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause); });
    return () => controller.abort();
  }, [wordId, version, selection, meaningLanguage, revision]);

  useLayoutEffect(() => {
    const popup = panel.current;
    if (!popup) return;
    function position() {
      if (!popup) return;
      const anchor = selection.trigger.getBoundingClientRect();
      const height = popup.getBoundingClientRect().height;
      popup.style.left = `${Math.max(12, Math.min(anchor.left, window.innerWidth - popup.offsetWidth - 12))}px`;
      const top = anchor.bottom + 8 + height <= window.innerHeight - 12 ? anchor.bottom + 8 : anchor.top - height - 8;
      popup.style.top = `${Math.max(12, Math.min(top, window.innerHeight - height - 12))}px`;
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !popup?.contains(event.target) && !selection.trigger.contains(event.target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(); }
    }
    position();
    closeButton.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(popup);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      if (popup.contains(document.activeElement) && selection.trigger.isConnected) selection.trigger.focus({ preventScroll: true });
    };
  }, [selection.trigger, close]);

  const changed = error instanceof VocabularyError && error.code === "example_changed";
  const busy = error instanceof VocabularyError && error.status === 429;
  const disabled = error instanceof VocabularyError && error.code === "dictionary_disabled";
  return createPortal(<div ref={panel} className="vocabulary-dictionary-popup" role="dialog" aria-labelledby={titleId}>
    <div className="vocabulary-dictionary-heading">
      <strong id={titleId} lang="ko">{selection.text}</strong>
      <button ref={closeButton} type="button" className="vocabulary-dictionary-close" onClick={close} aria-label={t.dictionaryClose}>×</button>
    </div>
    {error ? <div role="alert"><p>{disabled ? t.dictionaryPreparing : changed ? t.dictionaryChanged : busy ? t.dictionaryBusy : t.dictionaryError}</p>
      {!disabled && <button type="button" className="vocabulary-dictionary-link" onClick={changed ? reload : () => setRevision(value => value + 1)}>{changed ? t.dictionaryReload : t.retry}</button>}
    </div> : !data ? <p role="status">{t.dictionaryLoading}</p> : <div aria-live="polite">
      {!data.entries.length && <p>{t.dictionaryEmpty}</p>}
      {data.entries.map(entry => <section className="vocabulary-dictionary-entry" key={entry.id}>
        <h4 lang="ko">{entry.headword} <span>{entry.partOfSpeech}</span></h4>
        <ol>{entry.senses.map((sense, index) => <li key={index}>
          {sense.translation && <strong lang={meaningLanguage}>{sense.translation}</strong>}
          <p lang="ko">{sense.definition}</p>
          {sense.translatedDefinition ? <p lang={meaningLanguage}>{sense.translatedDefinition}</p>
            : !sense.translation && <p className="vocabulary-dictionary-note">{t.dictionaryMissingTranslation}</p>}
        </li>)}</ol>
        <a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">{t.dictionaryOriginal}</a>
      </section>)}
    </div>}
    <footer><span>{t.dictionarySource}</span>
      <a href="https://creativecommons.org/licenses/by-sa/2.0/kr/" target="_blank" rel="noopener noreferrer">{t.dictionaryLicense}</a>
    </footer>
  </div>, document.body);
}

export default function VocabularyExample({ wordId, text, analyzer, meaningLanguage, reload }: {
  wordId: string; text: string; analyzer: ExampleAnalyzer; meaningLanguage: MeaningLanguage; reload: () => void;
}) {
  const { language } = useApp();
  const t = vocabularyContent[language];
  const [data, setData] = useState<ExampleAnalysis | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const close = useCallback(() => setSelection(null), []);

  useEffect(() => {
    const controller = new AbortController();
    setData(null); setError(null); setSelection(null);
    void analyzer.analyze(text, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.segments.map(segment => segment.text).join("") !== text) throw new VocabularyError("example_changed", 409);
      setData(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(cause); });
    return () => controller.abort();
  }, [analyzer, wordId, text, revision]);

  const changed = error instanceof VocabularyError && error.code === "example_changed";
  const disabled = error instanceof VocabularyError && error.code === "dictionary_disabled";
  const busy = error instanceof VocabularyError && error.status === 429;
  return <>
    <p lang="ko" className="vocabulary-example-text">{data ? data.segments.map((segment, index) => !segment.candidates.length ? segment.text
      : <button key={index} type="button" className="vocabulary-example-word" aria-label={`${segment.text}: ${t.dictionaryLookup}`}
          aria-haspopup="dialog" aria-expanded={selection?.start === segment.start}
          onClick={event => setSelection({ ...segment, trigger: event.currentTarget })}>
          {segment.text}
        </button>) : text}</p>
    {error ? <div className="vocabulary-dictionary-status" role="status">
      {disabled ? t.dictionaryPreparing : changed ? t.dictionaryChanged : busy ? t.dictionaryBusy : t.dictionaryError}
      {!disabled && <> <button type="button" className="vocabulary-dictionary-link" onClick={changed ? reload : () => setRevision(value => value + 1)}>{changed ? t.dictionaryReload : t.retry}</button></>}
    </div> : !data ? <div className="vocabulary-dictionary-status" role="status">{t.analysisLoading}</div>
      : data.segments.some(segment => segment.candidates.length) && <div className="vocabulary-dictionary-status">{t.dictionaryHint}</div>}
    {data && selection && <MeaningPopup key={`${data.version}:${selection.start}:${meaningLanguage}`} wordId={wordId}
      version={data.version} selection={selection} meaningLanguage={meaningLanguage} close={close} reload={reload} />}
  </>;
}
