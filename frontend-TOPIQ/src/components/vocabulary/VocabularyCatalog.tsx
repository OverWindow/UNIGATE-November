"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { catalogSelection, VocabularyError, vocabularyRequest, type VocabularyCatalogData, type VocabularyLevel } from "@/lib/vocabulary-api";
import { vocabularyContent, vocabularyLevelLabel } from "@/lib/vocabulary-content";

export function VocabularyLoading() {
  const { language } = useApp();
  return <div className="page-container vocabulary-status" role="status">{vocabularyContent[language].loading}</div>;
}

export default function VocabularyCatalog() {
  const selection = catalogSelection(useSearchParams());
  return <CatalogPage {...selection} />;
}

function CatalogPage({ level, page }: { level: number; page: number }) {
  const { language } = useApp();
  const t = vocabularyContent[language];
  const [data, setData] = useState<{ levels: VocabularyLevel[]; catalog: VocabularyCatalogData } | null>(null);
  const [error, setError] = useState<{ level: number; page: number; cause: unknown } | null>(null);
  const [revision, setRevision] = useState(0);

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
    <section className="vocabulary-hero"><div className="page-container">
      <h1>{t.title}</h1><p>{t.intro}</p>
    </div></section>
    <div className="page-container vocabulary-catalog">
      <nav className="vocabulary-levels" data-level={level} aria-label={t.levelLabel}>
        {[3, 4, 5, 6].map(value => <Link key={value} href={`/vocabulary?level=${value}&page=1`} aria-current={level === value ? "page" : undefined} scroll={false}>
          {vocabularyLevelLabel(value, language)}
        </Link>)}
      </nav>
      <div className="vocabulary-catalog-heading"><h2>{vocabularyLevelLabel(level, language)}</h2>
        {summary && <p>{summary.wordCount.toLocaleString()}{language === "ko" ? "" : " "}{t.words}</p>}
      </div>
      {currentError ? <div className="vocabulary-status vocabulary-error" role="alert">
        <p>{currentError instanceof VocabularyError && currentError.status === 404 ? t.notFound : t.error}</p>
        <button className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
        {page !== 1 && <Link className="button vocabulary-secondary" href={`/vocabulary?level=${level}&page=1`}>{t.back}</Link>}
      </div> : !currentData ? <p className="vocabulary-status" role="status">{t.loading}</p> : <>
        <div className="vocabulary-set-grid">
          {currentData.catalog.sets.map(group => <article className="vocabulary-set-card" key={group.id}>
            <span className="vocabulary-set-number">{String(group.number).padStart(2, "0")}</span>
            <h3>{group.preview.map((word, index) => <span key={index} lang="ko">{word}</span>)}</h3>
            <div className="vocabulary-set-actions">
              <Link className="vocabulary-set-action" href={`/vocabulary/sets/${group.id}`}>{t.browse}<ExternalLink size={14} aria-hidden="true" /></Link>
              {group.quizQuestionCount ? <Link className="vocabulary-set-action" href={`/vocabulary/sets/${group.id}/quiz`}>
                {t.quiz}<ExternalLink size={14} aria-hidden="true" />
              </Link> : <span className="vocabulary-set-action vocabulary-quiz-unavailable">{group.quizQuestionCount === null ? t.quizUnavailable : t.quizPreparing}</span>}
            </div>
          </article>)}
        </div>
        {!currentData.catalog.sets.length && <p className="vocabulary-status">{t.empty}</p>}
        {currentData.catalog.pageCount > 1 && <nav className="vocabulary-pagination" aria-label={t.pagination}>
          {page > 1 ? <Link href={`/vocabulary?level=${level}&page=${page - 1}`}>{t.previous}</Link> : <span aria-disabled="true">{t.previous}</span>}
          <span aria-current="page">{page} / {currentData.catalog.pageCount}</span>
          {page < currentData.catalog.pageCount ? <Link href={`/vocabulary?level=${level}&page=${page + 1}`}>{t.next}</Link> : <span aria-disabled="true">{t.next}</span>}
        </nav>}
      </>}
    </div>
  </>;
}
