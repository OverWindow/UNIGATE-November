"use client";

import { useEffect } from "react";
import { useApp } from "@/app/providers";
import { landingContent, learningAreas, type LearningArea } from "@/lib/landing-content";
import SiteHeader, { Logo } from "./SiteHeader";
import SiteFooter from "./SiteFooter";
const sampleAnswers = [
  "한 번에 많은 양을 공부해야 한다.",
  "작은 노력을 꾸준히 이어 가는 것이 중요하다.",
  "결과는 노력과 관계없이 정해진다.",
  "계획보다 빠른 실천만이 중요하다.",
];

function Arrow({ external = false }: { external?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={external ? "M6 18 18 6M6 6h12v12" : "M4 12h15m-6-6 6 6-6 6"} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LearningIcon({ area }: { area: LearningArea }) {
  return (
    <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {area === "reading" && <><path d="M12 5.5C9 3.5 5 3.5 2.5 5v15c2.5-1.5 6.5-1.5 9.5.5 3-2 7-2 9.5-.5V5C19 3.5 15 3.5 12 5.5Z" /><path d="M12 5.5v15M6 8h2.5M6 11h2.5m7-3H18m-2.5 3H18" /></>}
      {area === "writing" && <><path d="m14.5 4.5 5 5M4 20l4.5-1 12-12a2.1 2.1 0 0 0-5-5l-12 12L2.5 19Z" /><path d="M12 21h9" /></>}
      {area === "vocabulary" && <><rect x="5" y="5" width="15" height="16" rx="2" /><path d="M16 2H5a3 3 0 0 0-3 3v12m7-7h7m-7 4h5" /></>}
    </svg>
  );
}

export default function LandingPage() {
  const { language } = useApp();
  const t = landingContent[language];

  useEffect(() => {
    document.title = `TOPIQ | ${landingContent[language].hero.eyebrow}`;
  }, [language]);

  return (
    <>
      <SiteHeader />

      <main id="main-content" tabIndex={-1}>
        <section id="intro" className="hero-section" aria-labelledby="hero-title">
          <div className="page-container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow hero-eyebrow"><span className="accent-dot" />{t.hero.eyebrow}</p>
              <h1 id="hero-title">{t.hero.title}</h1>
              <p className="hero-description">{t.hero.description}</p>
              <a className="button button-outline" href="#about">{t.hero.action}<Arrow /></a>
              <p className="hero-note">{t.hero.note}</p>
            </div>
            <div className="question-scene">
              <div className="question-card" role="img" aria-label={t.accessibility.example}>
                <div className="question-topline"><span>{t.hero.sampleLabel} <span className="question-number">/ 01</span></span><span className="sample-badge">{t.hero.sample}</span></div>
                <div lang="ko">
                  <p className="question-prompt">다음을 읽고 내용과 같은 것을 고르십시오.</p>
                  <p className="question-passage">매일 조금씩 쌓은 노력이<br />내일의 변화를 만듭니다.</p>
                  <ol className="answer-options">
                    {sampleAnswers.map((answer, index) => <li key={answer} className={index === 1 ? "answer-highlighted" : ""}><span className="answer-number">{index + 1}</span><span>{answer}</span>{index === 1 && <span className="answer-check" aria-hidden="true">✓</span>}</li>)}
                  </ol>
                </div>
                <div className="question-bottomline"><span className="sample-progress" aria-hidden="true"><span /><span /><span /></span><span>TOPIK II</span></div>
              </div>
              <p className="question-caption"><span aria-hidden="true">✦</span>{t.hero.sampleFooter}</p>
            </div>
          </div>
        </section>

        <section id="about" className="about-section section-space" aria-labelledby="about-title">
          <div className="page-container">
            <div className="about-intro">
              <div><Logo className="about-logo" /><h2 id="about-title" className="about-heading">{t.about.title}</h2></div>
              <p className="about-description">{t.about.description}</p>
            </div>
            <div className="feature-grid">
              {learningAreas.map((key, index) => (
                <article key={key} id={key} className="feature-card" aria-labelledby={`${key}-title`}>
                  <div className="feature-topline"><span className="feature-icon"><LearningIcon area={key} /></span><span className="feature-number">0{index + 1}</span></div>
                  <p className="feature-label">{t.areas[key].name}</p>
                  <h3 id={`${key}-title`}>{t.areas[key].title}</h3>
                  <p className="feature-description">{t.areas[key].description}</p>
                  <ul className="feature-points">{t.areas[key].points.map((point) => <li key={point}><span aria-hidden="true">✓</span>{point}</li>)}</ul>
                </article>
              ))}
            </div>
            <p className="development-note"><span className="status-dot" aria-hidden="true" />{t.about.notice}</p>
          </div>
        </section>

        <section id="topik-guide" className="guide-section section-space" aria-labelledby="guide-title">
          <div className="page-container guide-grid">
            <div><p className="eyebrow">{t.guide.eyebrow}</p><h2 id="guide-title" className="section-heading">{t.guide.title}</h2><p className="guide-description">{t.guide.description}</p><a className="text-link" href="https://www.topik.go.kr/" target="_blank" rel="noopener noreferrer">{t.guide.action}<Arrow external /></a></div>
            <div className="guide-panel"><span className="guide-wordmark">TOPIK<span lang="ko">한국어능력시험</span></span><ul>{t.guide.points.map((point, index) => <li key={point}><span className="guide-index">0{index + 1}</span><span>{point}</span></li>)}</ul></div>
          </div>
        </section>

        <section className="uses-section section-space" aria-labelledby="uses-title">
          <div className="page-container">
            <div className="centered-intro"><h2 id="uses-title" className="section-heading">{t.uses.title}</h2><p className="section-description">{t.uses.description}</p></div>
            <div className="uses-grid">{t.uses.cards.map((card, index) => <article key={card.title} className="use-card"><span className="use-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{index === 0 ? <><path d="m2 8 10-5 10 5-10 5L2 8Zm4 3v6c4 3 8 3 12 0v-6M22 8v7" /></> : index === 1 ? <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a20 20 0 0 0 18 0m-9 0v3" /></> : <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a17 17 0 0 1 0 18 17 17 0 0 1 0-18Z" /></>}</svg></span><h3>{card.title}</h3><p>{card.description}</p></article>)}</div>
          </div>
        </section>

        <section id="faq" className="faq-section section-space" aria-labelledby="faq-title">
          <div className="page-container faq-grid">
            <div><p className="eyebrow">FAQ</p><h2 id="faq-title" className="section-heading">{t.faq.title}</h2><p className="section-description">{t.faq.description}</p></div>
            <div className="faq-list">{t.faq.items.map(({ question, answer }, index) => <details key={index} name="topiq-faq"><summary><span>{question}</span><span className="faq-indicator" aria-hidden="true" /></summary><p>{answer}</p></details>)}</div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
