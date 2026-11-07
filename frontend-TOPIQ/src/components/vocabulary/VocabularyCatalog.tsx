"use client";

import Link from "next/link";
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
  return <CatalogPage key={`${selection.level}-${selection.page}`} {...selection} />;
}

function CatalogPage({ level, page }: { level: number; page: number }) {
  const { language } = useApp();
  const t = vocabularyContent[language];
  const [data, setData] = useState<{ levels: VocabularyLevel[]; catalog: VocabularyCatalogData } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    setError(null);
    setData(null);
    void Promise.all([
      vocabularyRequest<{ levels: VocabularyLevel[] }>("levels/"),
      vocabularyRequest<VocabularyCatalogData>(`sets/?level=${level}&page=${page}`),
    ]).then(([summary, catalog]) => {
      if (active) setData({ levels: summary.levels, catalog });
    }).catch(cause => { if (active) setError(cause); });
    return () => { active = false; };
  }, [level, page, revision]);

  const summary = data?.levels.find(item => item.level === level);
  return <>
    <section className="vocabulary-hero"><div className="page-container">
      <p className="eyebrow">TOPIK II · {t.vocabulary}</p>
      <h1>{t.title}</h1><p>{t.intro}</p>
    </div></section>
    <div className="page-container vocabulary-catalog">
      <nav className="vocabulary-levels" aria-label={t.levelLabel}>
        {[3, 4, 5, 6].map(value => <Link key={value} href={`/vocabulary?level=${value}&page=1`} aria-current={level === value ? "page" : undefined} scroll={false}>
          {vocabularyLevelLabel(value, language)}
        </Link>)}
      </nav>
      <div className="vocabulary-catalog-heading"><h2>{vocabularyLevelLabel(level, language)}</h2>
        {summary && <p>{summary.wordCount.toLocaleString()} {t.words}<span>·</span>{summary.setCount} {t.sets}</p>}
      </div>
      {error ? <div className="vocabulary-status vocabulary-error" role="alert">
        <p>{error instanceof VocabularyError && error.status === 404 ? t.notFound : t.error}</p>
        <button className="button vocabulary-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
        {page !== 1 && <Link className="button vocabulary-secondary" href={`/vocabulary?level=${level}&page=1`}>{t.back}</Link>}
      </div> : !data ? <p className="vocabulary-status" role="status">{t.loading}</p> : <>
        <div className="vocabulary-set-grid">
          {data.catalog.sets.map(group => <Link className="vocabulary-set-card" key={group.id} href={`/vocabulary/sets/${group.id}`}>
            <div className="vocabulary-set-top"><span>SET {String(group.number).padStart(2, "0")}</span><span>{group.wordCount} {t.words}</span></div>
            <h3>{group.preview.map((word, index) => <span key={index} lang="ko">{word}</span>)}</h3>
            <div className="vocabulary-set-action">{t.browse}<span aria-hidden="true">↗</span></div>
          </Link>)}
        </div>
        {!data.catalog.sets.length && <p className="vocabulary-status">{t.empty}</p>}
        {data.catalog.pageCount > 1 && <nav className="vocabulary-pagination" aria-label={t.pagination}>
          {page > 1 ? <Link href={`/vocabulary?level=${level}&page=${page - 1}`}>{t.previous}</Link> : <span aria-disabled="true">{t.previous}</span>}
          <span aria-current="page">{page} / {data.catalog.pageCount}</span>
          {page < data.catalog.pageCount ? <Link href={`/vocabulary?level=${level}&page=${page + 1}`}>{t.next}</Link> : <span aria-disabled="true">{t.next}</span>}
        </nav>}
      </>}
    </div>
  </>;
}
