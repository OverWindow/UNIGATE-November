"use client";

import Image from "next/image";
import { BriefcaseBusiness, Check, Clock3, ExternalLink, GraduationCap, Minus, Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useApp } from "@/app/providers";
import { homeContent } from "@/lib/home-content";
import SiteHeader from "./SiteHeader";
import HomeTestSelector from "./HomeTestSelector";
import instituteLogo from "../../public/brand/niied-logo.png";
import styles from "./LandingPage.module.css";

const useIcons = [GraduationCap, BriefcaseBusiness, ShieldCheck];

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
            </div>
            <div className={styles.preview} aria-hidden="true" lang="ko">
              <div className={styles.previewQuestion}>
                <p className={styles.previewLabel}>QUESTION 25</p>
                <p className={styles.previewPrompt}>다음 신문 기사의 제목을 가장 잘 설명한 것을 고르십시오.</p>
                <div className={styles.previewOptions}>
                  {["①", "②", "③", "④"].map((number, index) => <div className={styles.previewOption} key={number}><span>{number}</span><i style={{ width: `${54 + index * 8}%` }} /></div>)}
                </div>
              </div>
              <div className={styles.previewBottom}><span>24 / 50</span><span><Clock3 size={16} aria-hidden="true" />38:24</span></div>
            </div>
          </div>
        </section>

        <div className={styles.flow}>
          <HomeTestSelector />

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
                <ul className={styles.guideList}>{t.guide.points.map(point => <li key={point}><Check size={16} aria-hidden="true" /><span>{point}</span></li>)}</ul>
                <div className={styles.officialLink}><a href="https://www.topik.go.kr/" target="_blank" rel="noopener noreferrer">{t.guide.action}<ExternalLink size={14} aria-hidden="true" /></a></div>
              </div>
            </div>
          </section>

          <section id="topik-uses" className={styles.section} aria-labelledby="uses-title">
            <div className={styles.container}>
              <div className={styles.sectionIntro}><h2 id="uses-title" className={styles.heading}>{t.uses.title}</h2><p className={styles.description}>{t.uses.description}</p></div>
              <div className={styles.useGrid}>{t.uses.cards.map((card, index) => {
                const Icon = useIcons[index];
                return <article className={styles.useCard} key={card.title}><span className={styles.useIcon}><Icon size={24} aria-hidden="true" /></span><h3>{card.title}</h3><p>{card.description}</p></article>;
              })}</div>
            </div>
          </section>

          <section id="topik-faq" className={`${styles.section} ${styles.faq}`} aria-labelledby="faq-title">
            <div className={`${styles.container} ${styles.faqContainer}`}>
              <h2 id="faq-title" className={styles.heading}>{t.faq.title}</h2>
              <div className={styles.faqList}>{t.faq.items.map(({ question, answer }, index) => <div className={styles.faqItem} key={index}>
                <button id={`faq-question-${index}`} className={styles.faqTrigger} type="button" aria-expanded={openFaq === index} aria-controls={`faq-answer-${index}`} onClick={() => setOpenFaq(openFaq === index ? null : index)}>{question}<span aria-hidden="true">{openFaq === index ? <Minus size={16} /> : <Plus size={16} />}</span></button>
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
