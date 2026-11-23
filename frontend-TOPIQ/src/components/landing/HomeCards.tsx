"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
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
  return <div className={styles.cardsArea} data-reveal>
    <InteractiveDots />
    <div className={styles.container}>
      <section className={styles.pricing} aria-labelledby="home-plans-title">
        <h2 id="home-plans-title" className={styles.heading}>{pricing.title}</h2>
        <div className={styles.planSharedBenefits}>
          <ul className={styles.planBenefits} role="list">{plan.benefits(publicPlans[0].bonusCredits).map(benefit =>
            <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
          )}</ul>
        </div>
        <div className={styles.planRow}>
            {publicPlans.map(({ months, amount }) => {
              const savings = planSavingsPercent(amount, months, publicPlans[0].amount);
              return <Link key={months} href={localizedPath("/plans", language)} className={styles.planCard}>
                <span className={styles.planTerm}>{plan.term(months)}<ArrowRight size={17} aria-hidden="true" /></span>
                <strong className={styles.planPrice}>{price.format(amount)}</strong>
                <span className={styles.planSavings}>{savings > 0 ? plan.savings(savings) : "\u00a0"}</span>
              </Link>;
            })}
        </div>
      </section>
    </div>
  </div>;
}
