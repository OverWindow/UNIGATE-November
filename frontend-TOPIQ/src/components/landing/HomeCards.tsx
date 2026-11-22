import Link from "next/link";
import { ArrowRight, BookOpen, Check, ChevronRight, FileText, Monitor, PenLine } from "lucide-react";
import { homeContent } from "@/lib/home-content";
import type { Language } from "@/lib/landing-content";
import { plansContent } from "@/lib/plans-content";
import InteractiveDots from "./InteractiveDots";
import styles from "./LandingPage.module.css";

const learningCards = [
  { key: "pbt", href: "/pbt", icon: FileText },
  { key: "ibt", href: "/ibt", icon: Monitor },
  { key: "vocabulary", href: "/vocabulary", icon: BookOpen },
  { key: "writing", href: "/writing", icon: PenLine },
] as const;

// Public offer details mirror PLAN_AMOUNTS and PLAN_BONUS in backend/accounts/models.py.
const planBonusCredits = 400;
const plans = [
  { months: 1, amount: 9900 },
  { months: 3, amount: 23900 },
  { months: 6, amount: 43900 },
];

export default function HomeCards({ language }: { language: Language }) {
  const { learning, pricing } = homeContent[language];
  const plan = plansContent[language];
  const benefits = plan.benefits(planBonusCredits);
  const price = new Intl.NumberFormat(language, { style: "currency", currency: "KRW" });

  return <div className={styles.cardsArea}>
    <InteractiveDots />
    <div className={styles.container}>
      <section id="tests" aria-labelledby="tests-title">
        <h2 id="tests-title" className={styles.heading}>{learning.title}</h2>
        <div className={styles.learningCards}>
          {learningCards.map(({ key, href, icon: Icon }) => (
            <Link key={key} href={href} className={styles.learningCard}>
              <span className={styles.cardIcon}><Icon size={22} aria-hidden="true" /></span>
              <span>{learning[key]}</span>
              <ChevronRight size={18} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>
      <section className={styles.pricing} aria-labelledby="home-plans-title">
        <h2 id="home-plans-title" className={styles.heading}>{pricing.title}</h2>
        <div className={styles.planRow}>
          {plans.map(({ months, amount }) => (
            <Link key={months} href="/plans" className={styles.planCard}>
              <span className={styles.planTerm}>{plan.term(months)}<ArrowRight size={17} aria-hidden="true" /></span>
              <strong className={styles.planPrice}>{price.format(amount)}</strong>
              <span className={styles.planRenewal}>{pricing.renewal(months)}</span>
              <ul className={styles.planBenefits} role="list">
                {benefits.map(benefit => (
                  <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
                ))}
              </ul>
            </Link>
          ))}
        </div>
      </section>
    </div>
  </div>;
}
