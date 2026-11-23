"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { catalogSelection, VocabularyError, vocabularyRequest, type VocabularyCatalogData, type VocabularyLevel } from "@/lib/vocabulary/vocabulary-api";
import { vocabularyContent, vocabularyLevelLabel } from "@/lib/vocabulary/vocabulary-content";
import { localizedPath } from "@/lib/locale-path";

export function VocabularyLoading() {
  const { language } = useApp();
  return <div className="page-container catalog-status" role="status">{vocabularyContent[language].loading}</div>;
}

export default function VocabularyCatalog() {
  const selection = catalogSelection(useSearchParams());
  return <CatalogPage {...selection} />;
}

function CatalogPage({ level, page }: { level: number; page: number }) {
  const { language, user } = useApp();
  const t = vocabularyContent[language];
  const [data, setData] = useState<{ levels: VocabularyLevel[]; catalog: VocabularyCatalogData } | null>(null);
  const [error, setError] = useState<{ level: number; page: number; cause: unknown } | null>(null);
  const [revision, setRevision] = useState(0);
  const plusDialog = useRef<HTMLDialogElement>(null);
  const closeLabel = { ko: "닫기", en: "Close", id: "Tutup" }[language];
  function checkAccess(event: React.MouseEvent<HTMLAnchorElement>, number: number) {
    if (number <= 3 || user?.plusEndsAt) return;
    event.preventDefault();
    plusDialog.current?.showModal();
  }

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setError(null);
    setData(null);
    void Promise.all([
      vocabularyRequest<{ levels: VocabularyLevel[] }>("levels/", controller.signal),
      vocabularyRequest<VocabularyCatalogData>(`sets/?level=${level}&page=${page}`, controller.signal),
    ]).then(([summary, catalog]) => {
      if (active) setData({ levels: summary.levels, catalog });
    }).catch(cause => { if (active) setError({ level, page, cause }); });
    return () => { active = false; controller.abort(); };
  }, [level, page, revision]);

  const currentData = data?.catalog.level === level && data.catalog.page === page ? data : null;
  const currentError = error?.level === level && error.page === page ? error.cause : null;
  const summary = currentData?.levels.find(item => item.level === level);
  return <>
    <section className="catalog-hero"><div className="page-container">
      <h1 className="catalog-title">{t.title}</h1><p className="catalog-description">{t.intro}</p>
    </div></section>
    <div className="page-container vocabulary-catalog">
      <nav className="vocabulary-levels section-switch" aria-label={t.levelLabel}>
        {[3, 4, 5, 6].map(value => <Link key={value} href={localizedPath(`/vocabulary?level=${value}&page=1`, language)} aria-current={level === value ? "page" : undefined} scroll={false}>
          {vocabularyLevelLabel(value, language)}
        </Link>)}
      </nav>
      <div className="vocabulary-catalog-heading"><h2>{vocabularyLevelLabel(level, language)}</h2>
        {summary && <p>{summary.wordCount.toLocaleString()}{language === "ko" ? "" : " "}{t.words}</p>}
      </div>
      {currentError ? <div className="catalog-status vocabulary-error" role="alert">
        <p>{currentError instanceof VocabularyError && currentError.status === 404 ? t.notFound : t.error}</p>
        <button className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
        {page !== 1 && <Link className="button vocabulary-secondary" href={localizedPath(`/vocabulary?level=${level}&page=1`, language)}>{t.back}</Link>}
      </div> : !currentData ? <p className="catalog-status" role="status">{t.loading}</p>
        : !currentData.catalog.sets.length ? <p className="catalog-status">{t.empty}</p> : <>
        <div className="vocabulary-set-grid">
          {currentData.catalog.sets.map(group => <article className="vocabulary-set-card catalog-card" key={group.id}>
            <span className="catalog-set-number">{String(group.number).padStart(2, "0")}</span>
            <h3>{group.preview.map((word, index) => <span key={index} lang="ko">{word}</span>)}</h3>
            <div className="vocabulary-set-actions">
              <Link onClick={event => checkAccess(event, group.number)} className="vocabulary-set-action" href={localizedPath(`/vocabulary/sets/${group.id}`, language)}>{t.browse}<ExternalLink size={14} aria-hidden="true" /></Link>
              {group.quizQuestionCount ? <Link onClick={event => checkAccess(event, group.number)} className="vocabulary-set-action" href={localizedPath(`/vocabulary/sets/${group.id}/quiz`, language)}>
                {t.quiz}<ExternalLink size={14} aria-hidden="true" />
              </Link> : <span className="vocabulary-set-action vocabulary-quiz-unavailable">{group.quizQuestionCount === null ? t.quizUnavailable : t.quizPreparing}</span>}
            </div>
          </article>)}
        </div>
        {currentData.catalog.pageCount > 1 && <nav className="vocabulary-pagination" aria-label={t.pagination}>
          {page > 1 ? <Link href={localizedPath(`/vocabulary?level=${level}&page=${page - 1}`, language)}>{t.previous}</Link> : <span aria-disabled="true">{t.previous}</span>}
          <span aria-current="page">{page} / {currentData.catalog.pageCount}</span>
          {page < currentData.catalog.pageCount ? <Link href={localizedPath(`/vocabulary?level=${level}&page=${page + 1}`, language)}>{t.next}</Link> : <span aria-disabled="true">{t.next}</span>}
        </nav>}
      </>}
    </div>
    <dialog ref={plusDialog} className="vocabulary-plus-dialog" aria-labelledby="vocabulary-plus-title" aria-describedby="vocabulary-plus-note"
      onClick={event => { if (event.target === event.currentTarget) plusDialog.current?.close(); }}>
      <h2 id="vocabulary-plus-title">{t.viewPlus}</h2>
      <p id="vocabulary-plus-note">{t.plusRequired}</p>
      <div className="vocabulary-plus-actions">
        <button type="button" className="button vocabulary-secondary" onClick={() => plusDialog.current?.close()}>{closeLabel}</button>
        <Link className="button button-primary" href={localizedPath("/plans", language)}>{t.viewPlus}</Link>
      </div>
    </dialog>
  </>;
}
