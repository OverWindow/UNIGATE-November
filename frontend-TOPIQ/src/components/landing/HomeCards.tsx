"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useRef } from "react";
import { homeContent } from "@/lib/home-content";
import type { Language } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { planSavingsPercent, plansContent, publicPlans } from "@/lib/plans-content";
import InteractiveDots from "./InteractiveDots";
import styles from "./LandingPage.module.css";

export default function HomeCards({ language }: { language: Language }) {
  const { pricing } = homeContent[language];
  const plan = plansContent[language];
  const price = new Intl.NumberFormat(language, { style: "currency", currency: "KRW" });
  const trackRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const track = trackRef.current;
    const row = rowRef.current;
    if (!track || !row) return;
    let step = 0;
    let stickyTop = 0;
    const update = () => {
      if (!step) return;
      const index = Math.min(row.children.length - 1, Math.max(0,
        Math.floor((-track.getBoundingClientRect().top + stickyTop) / step)));
      row.scrollLeft = index * step;
    };
    const measure = () => {
      if (window.innerWidth >= 640) {
        step = 0;
        track.style.height = "";
        row.scrollLeft = 0;
        return;
      }
      step = row.clientWidth + 12;
      stickyTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) + 16;
      track.style.height = `${row.offsetHeight + step * row.children.length}px`;
      update();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(row);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", update, { passive: true });
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", update);
      track.style.height = "";
    };
  }, [language]);

  return <div className={styles.cardsArea} data-reveal>
    <InteractiveDots />
    <div className={styles.container}>
      <section className={styles.pricing} aria-labelledby="home-plans-title">
        <h2 id="home-plans-title" className={styles.heading}>{pricing.title}</h2>
        <div className={styles.planSharedBenefits}>
          <h3 className={styles.planSharedTitle}>Plus</h3>
          <ul className={styles.planBenefits} role="list">{plan.benefits(publicPlans[0].bonusCredits).map(benefit =>
            <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
          )}</ul>
        </div>
        <div className={styles.planScrollTrack} ref={trackRef}>
          <div className={styles.planRow} ref={rowRef}>
            <article className={`${styles.planCard} ${styles.planFree}`}>
              <span className={styles.planTerm}>Free</span>
              <strong className={styles.planPrice}>{price.format(0)}</strong>
              <ul className={styles.planBenefits} role="list">{plan.freeBenefits.map(benefit =>
                <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
              )}</ul>
            </article>
            {publicPlans.map(({ months, amount }) => {
              const savings = planSavingsPercent(amount, months, publicPlans[0].amount);
              return <Link key={months} href={localizedPath("/plans", language)} className={styles.planCard}>
                <span className={styles.planTerm}>{plan.term(months)}<ArrowRight size={17} aria-hidden="true" /></span>
                <strong className={styles.planPrice}>{price.format(amount)}</strong>
                <span className={styles.planRenewal}>{plan.interval(months)}</span>
                {savings > 0 && <span className={styles.planSavings}>{plan.savings(savings)}</span>}
              </Link>;
            })}
          </div>
        </div>
      </section>
    </div>
  </div>;
}
