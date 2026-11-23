"use client";

import Link from "next/link";
import { localizedPath } from "@/lib/locale-path";
import Image from "next/image";
import { Check, ExternalLink, Minus, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { homeContent } from "@/lib/home-content";
import SiteHeader from "../SiteHeader";
import SiteFooter from "../SiteFooter";
import HomeCards from "./HomeCards";
import LandingCharacter from "./LandingCharacter";
import instituteLogo from "../../../public/brand/niied-logo.png";
import styles from "./LandingPage.module.css";

export default function LandingPage() {
  const { language } = useApp();
  const t = homeContent[language];
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const main = mainRef.current;
    if (!main || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sections = main.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        (entry.target as HTMLElement).dataset.revealVisible = "true";
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.12, rootMargin: "0px 0px -32px 0px" });
    sections.forEach(section => observer.observe(section));
    main.dataset.revealReady = "true";
    return () => observer.disconnect();
  }, []);

  return <>
    <SiteHeader />
    <div className={styles.page}>
      <main id="main-content" tabIndex={-1} ref={mainRef}>
        <section id="intro" className={styles.hero} aria-labelledby="hero-title">
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroCopy}>
              <h1 id="hero-title">{t.hero.title}</h1>
              <p className={styles.description}>{t.hero.description}</p>
              <Link className={`button ${styles.heroAction}`} href={localizedPath("/pbt", language)}>{t.hero.action}</Link>
            </div>
            <LandingCharacter />
          </div>
        </section>

        <div className={styles.flow}>
          <HomeCards language={language} />

          <section id="topik-guide" className={`${styles.container} ${styles.section}`} aria-labelledby="guide-title" data-reveal>
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

          <section id="topik-uses" className={styles.section} aria-labelledby="uses-title" data-reveal>
            <div className={styles.container}>
              <div className={styles.sectionIntro}><h2 id="uses-title" className={styles.heading}>{t.uses.title}</h2><p className={styles.description}>{t.uses.description}</p></div>
              <div className={styles.useGrid}>{t.uses.cards.map(card => <article className={styles.useItem} key={card.title}><h3>{card.title}</h3><p>{card.description}</p></article>)}</div>
            </div>
          </section>

          <section id="topik-faq" className={`${styles.section} ${styles.faq}`} aria-labelledby="faq-title" data-reveal>
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
    </div>
    <SiteFooter />
  </>;
}
