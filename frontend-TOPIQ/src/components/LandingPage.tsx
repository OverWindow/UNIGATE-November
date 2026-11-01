"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { landingContent, learningAreas, type Language, type LearningArea } from "@/lib/landing-content";

const languages: { code: Language; label: string; name: string }[] = [
  { code: "ko", label: "한국어", name: "한국어" },
  { code: "en", label: "EN", name: "English" },
  { code: "id", label: "ID", name: "Bahasa Indonesia" },
];
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

function Logo({ className = "" }: { className?: string }) {
  return <Image className={`topiq-logo ${className}`} src="/brand/topiq-logo.png" alt="TOPIQ" width={1945} height={808} sizes="112px" />;
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
  const [language, setLanguage] = useState<Language>("ko");
  const [area, setArea] = useState<LearningArea>("reading");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const t = landingContent[language];

  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `TOPIQ | ${landingContent[language].hero.eyebrow}`;
  }, [language]);

  const closeMenu = () => setMenuOpen(false);
  const navigation = t.navigation.map((label) => (
    <button key={label} type="button" disabled>{label}</button>
  ));

  return (
    <>
      <a className="skip-link" href="#main-content">{t.accessibility.skip}</a>
      <header className="site-header" onKeyDown={(event) => {
        if (event.key === "Escape" && menuOpen) {
          closeMenu();
          menuButton.current?.focus();
        }
      }}>
        <div className="page-container header-inner">
          <a className="brand-link" href="#intro" aria-label={t.accessibility.home} onClick={closeMenu}>
            <Logo />
            <span className="brand-tag">TOPIK II</span>
          </a>
          <nav className="desktop-navigation" aria-label={t.accessibility.navigation}>{navigation}</nav>
          <div className="header-actions">
            <div className="language-switcher" role="group" aria-label={t.accessibility.language}>
              {languages.map(({ code, label, name }) => (
                <button key={code} type="button" lang={code} aria-label={name} aria-pressed={language === code} onClick={() => setLanguage(code)}>{label}</button>
              ))}
            </div>
            <button className="header-login" type="button" disabled>{t.login}</button>
            <button className="menu-toggle" type="button" ref={menuButton} aria-label={menuOpen ? t.accessibility.closeMenu : t.accessibility.openMenu} aria-controls="mobile-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d={menuOpen ? "m6 6 12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>
        <nav className="mobile-navigation" id="mobile-navigation" aria-label={t.accessibility.navigation} hidden={!menuOpen}>{navigation}</nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section id="intro" className="hero-section" aria-labelledby="hero-title">
          <div className="page-container hero-grid">
            <div className="hero-copy">
              <p className="eyebrow hero-eyebrow"><span className="accent-dot" />{t.hero.eyebrow}</p>
              <h1 id="hero-title">{t.hero.title}</h1>
              <p className="hero-description">{t.hero.description}</p>
              <a className="button button-outline" href="#learning">{t.hero.action}<Arrow /></a>
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

        <section id="learning" className="learning-section section-space" aria-labelledby="learning-title">
          <div className="page-container">
            <p className="eyebrow">{t.learning.eyebrow}</p>
            <h2 id="learning-title" className="section-heading">{t.learning.title}</h2>
            <p className="section-description">{t.learning.description}</p>
            <div className="learning-panel">
              <div className="learning-select">
                <label htmlFor="learning-area">{t.learning.field}</label>
                <select id="learning-area" value={area} aria-describedby="learning-selection-description" onChange={(event) => setArea(event.target.value as LearningArea)}>
                  {learningAreas.map((key) => <option key={key} value={key}>{t.areas[key].name}</option>)}
                </select>
              </div>
              <div className="learning-summary">
                <span className="field-label">{t.learning.focus}</span>
                <p id="learning-selection-description" aria-live="polite">{t.areas[area].summary}</p>
              </div>
              <a className="button button-primary" href={`#${area}`}>{t.learning.action}<Arrow /></a>
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
                <article key={key} id={key} className="feature-card" data-active={area === key} aria-labelledby={`${key}-title`}>
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

      <footer className="site-footer">
        <div className="page-container"><div className="footer-main"><div><a href="#intro" aria-label={t.accessibility.home}><Logo /></a><p>{t.footer.description}</p></div><div className="footer-links"><a href="https://www.unigate.kr/" target="_blank" rel="noopener noreferrer">{t.footer.parent}<Arrow external /></a><a href="#intro">{t.footer.top}<span aria-hidden="true">↑</span></a></div></div><div className="footer-bottom"><span>© 2026 UNIGATE. All rights reserved.</span><span>{t.footer.tagline}</span></div></div>
      </footer>
    </>
  );
}
