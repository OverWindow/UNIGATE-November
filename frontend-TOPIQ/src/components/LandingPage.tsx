"use client";

import Image from "next/image";
import { useState } from "react";
import { useApp } from "@/app/providers";
import { homeContent } from "@/lib/home-content";
import SiteHeader from "./SiteHeader";
import HomeTestSelector from "./HomeTestSelector";
import instituteLogo from "../../public/brand/niied-logo.png";
import topiqLogo from "../../public/brand/topiq-logo.png";
import styles from "./LandingPage.module.css";

function UseIcon({ index }: { index: number }) {
  return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {index === 0 ? <><path d="m2 10 10-5 10 5-10 5-10-5ZM22 10v6M6 12v4a6 3 0 0 0 12 0v-4" /></>
      : index === 1 ? <><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M16 6V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M22 13a18 18 0 0 1-20 0M12 12h.01" /></>
        : <><path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V6a1 1 0 0 1 1-1c2 0 4.5-1.2 7-3 2.5 1.8 5 3 7 3a1 1 0 0 1 1 1Z" /><path d="m9 12 2 2 4-4" /></>}
  </svg>;
}

export default function LandingPage() {
  const { language } = useApp();
  const t = homeContent[language];
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return <>
    <SiteHeader />
    <div className={styles.page}>
      <main id="main-content" tabIndex={-1}>
        <section id="intro" className={styles.hero} aria-labelledby="hero-title">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title">{t.hero.title}</h1>
              <p className={styles.description}>{t.hero.description}</p>
              <a className={styles.introLink} href="#full-version">{t.hero.action}</a>
            </div>
            <div className={styles.preview} aria-hidden="true" lang="ko">
              <div className={styles.previewQuestion}>
                <p className={styles.previewLabel}>QUESTION 25</p>
                <p className={styles.previewPrompt}>다음 신문 기사의 제목을 가장 잘 설명한 것을 고르십시오.</p>
                <div className={styles.previewOptions}>
                  {["①", "②", "③", "④"].map((number, index) => <div className={styles.previewOption} key={number}><span>{number}</span><i style={{ width: `${54 + index * 8}%` }} /></div>)}
                </div>
              </div>
              <div className={styles.previewBottom}><span>24 / 50</span><span><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6h4" /></svg>38:24</span></div>
            </div>
          </div>
        </section>

        <div className={styles.flow}>
          <HomeTestSelector />

          <section id="full-version" className={`${styles.section} ${styles.about}`} aria-labelledby="about-title">
            <div className={styles.container}>
              <div className={styles.aboutIntro}>
                <div><Image className={styles.aboutLogo} src={topiqLogo} alt="TOPIQ" sizes="87px" /><h2 id="about-title" className={styles.aboutTitle}>{t.about.title}</h2></div>
                <p className={styles.description}>{t.about.description}</p>
              </div>
              <div className={styles.features}>
                {t.about.features.map(feature => <article className={styles.feature} key={feature.title}><h3>{feature.title}</h3><p>{feature.description}</p></article>)}
              </div>
              <p className={styles.notice}>{t.about.notice}</p>
            </div>
          </section>

          <section id="topik-guide" className={`${styles.container} ${styles.section}`} aria-labelledby="guide-title">
            <div className={styles.guideGrid}>
              <div className={styles.guideIntro}>
                <h2 id="guide-title" className={styles.heading}>{t.guide.title}</h2>
                <div className={styles.organizations} role="group" aria-label={t.guide.organizations}>
                  <Image src="/brand/moe-logo.svg" width={125} height={48} alt={t.guide.ministry} />
                  <span className={styles.organizationDivider} aria-hidden="true" />
                  <Image src={instituteLogo} alt={t.guide.institute} sizes="180px" />
                </div>
              </div>
              <div>
                <ul className={styles.guideList}>{t.guide.points.map(point => <li key={point}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m20 6-11 11-5-5" /></svg><span>{point}</span></li>)}</ul>
                <div className={styles.officialLink}><a href="https://www.topik.go.kr/" target="_blank" rel="noopener noreferrer">{t.guide.action}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></svg></a></div>
              </div>
            </div>
          </section>

          <section id="topik-uses" className={styles.section} aria-labelledby="uses-title">
            <div className={styles.container}>
              <div className={styles.sectionIntro}><h2 id="uses-title" className={styles.heading}>{t.uses.title}</h2><p className={styles.description}>{t.uses.description}</p></div>
              <div className={styles.useGrid}>{t.uses.cards.map((card, index) => <article className={styles.useCard} key={card.title}><span className={styles.useIcon}><UseIcon index={index} /></span><h3>{card.title}</h3><p>{card.description}</p></article>)}</div>
            </div>
          </section>

          <section id="topik-faq" className={`${styles.section} ${styles.faq}`} aria-labelledby="faq-title">
            <div className={`${styles.container} ${styles.faqContainer}`}>
              <h2 id="faq-title" className={styles.heading}>{t.faq.title}</h2>
              <div className={styles.faqList}>{t.faq.items.map(({ question, answer }, index) => <div className={styles.faqItem} key={index}>
                <button id={`faq-question-${index}`} className={styles.faqTrigger} type="button" aria-expanded={openFaq === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{question}<span aria-hidden="true">+</span></button>
                <div id={`faq-answer-${index}`} className={styles.faqAnswer} role="region" aria-labelledby={`faq-question-${index}`} aria-hidden={openFaq !== index} data-open={openFaq === index}><div><p>{answer}</p></div></div>
              </div>)}</div>
            </div>
          </section>
        </div>
      </main>
      <footer className={`${styles.flow} ${styles.footer}`}>
        <div className={styles.container}><div className={styles.footerContent}>
          <div className={styles.footerLine}><span>UNIGATE TOPIQ</span><span>© 2026 UNIGATE. All rights reserved.</span></div>
          <p>{t.trademark}</p>
        </div></div>
      </footer>
    </div>
  </>;
}
