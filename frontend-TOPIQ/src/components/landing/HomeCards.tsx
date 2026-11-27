"use client";

import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { useEffect, useState } from "react";
import { useApp } from "@/app/providers";
import { homeContent } from "@/lib/home-content";
import type { Language } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import { plansContent, publicPlans } from "@/lib/plans-content";
import { getPlans } from "@/lib/writing/writing-api";
import InteractiveDots from "./InteractiveDots";
import styles from "./LandingPage.module.css";

export default function HomeCards({ language }: { language: Language }) {
  const { user, status } = useApp();
  const userId = user?.id;
  const [eligibility, setEligibility] = useState<{ userId: number; eligible: boolean } | null>(null);
  const trial = status === "anonymous" || (eligibility?.userId === userId && eligibility?.eligible === true);
  const showMonthlyPrice = status === "anonymous" || (eligibility !== null && eligibility.userId === userId);

  useEffect(() => {
    if (userId === undefined) {
      setEligibility(null);
      return;
    }
    const controller = new AbortController();
    getPlans(controller.signal).then(({ trialEligible }) => {
      if (!controller.signal.aborted) setEligibility({ userId, eligible: trialEligible });
    }).catch(() => {});
    return () => controller.abort();
  }, [userId]);

  const { pricing } = homeContent[language];
  const plan = plansContent[language];
  const price = new Intl.NumberFormat(language, { style: "currency", currency: "KRW" });
  return <div className={styles.cardsArea} data-reveal>
    <InteractiveDots />
    <div className={styles.container}>
      <section className={styles.pricing} aria-labelledby="home-plans-title">
        <h2 id="home-plans-title" className={styles.heading}>{pricing.title}</h2>
        <div className={styles.planSharedBenefits}>
          <ul className={styles.planBenefits} role="list">{[...plan.benefits, plan.trial.bonus(publicPlans[0].bonusCredits)].map(benefit =>
            <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
          )}</ul>
        </div>
        <div className={styles.planRow}>
            {publicPlans.map(({ months, amount }) => {
              return <Link key={months} href={localizedPath("/plans", language)} className={styles.planCard}>
                <span className={styles.planTerm}>{plan.term(months)}<ArrowRight size={17} aria-hidden="true" /></span>
                {(months > 1 || showMonthlyPrice) && <strong className={`${styles.planPrice}${months > 1 ? ` ${styles.planPriceBlurred}` : ""}`} aria-hidden={months > 1 || undefined}>{price.format(months === 1 && trial ? 0 : amount)}</strong>}
                {months > 1 ? <span className={styles.planSavings}>{pricing.checkPrice}</span>
                  : trial && <span className={styles.planSavings}>{pricing.trial}</span>}
              </Link>;
            })}
        </div>
      </section>
    </div>
  </div>;
}
