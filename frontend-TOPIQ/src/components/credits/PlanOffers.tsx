import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { Language } from "@/lib/landing-content";
import { planAmount, planSavingsPercent, plansContent, publicPlans } from "@/lib/plans-content";
import type { PlanAccount, PlanOffer } from "@/lib/writing/writing-api";

export default function PlanOffers({ language, account, renderAction }: {
  language: Language;
  account?: PlanAccount;
  renderAction: (offer: PlanOffer) => ReactNode;
}) {
  const p = plansContent[language];
  const currentBadge = <span className="plan-current-badge">{p.current}</span>;
  const isFree = account?.active === false;
  const offers = account?.plans ?? publicPlans;
  const monthlyAmount = offers.find(offer => offer.months === 1)?.amount;

  return <div className="plan-offers">
    <article className="plan-offer plan-free" aria-current={isFree || undefined}>
      <div className="plan-heading"><h2>Free</h2>{isFree && currentBadge}</div>
      <p className="plan-price">{planAmount(language, 0)}</p>
      <ul className="plan-benefits" role="list">{p.freeBenefits.map(benefit =>
        <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
      )}</ul>
    </article>
    {offers.map(offer => {
      const { months, amount } = offer;
      const current = account?.currentPlanMonths === months;
      const trialOffer = offer.trialDays === 7 && !account?.active && !account?.subscription && account?.trialEligible !== false;
      const benefits = [...p.benefits, p.trial.bonus(offer.bonusCredits)];
      const savings = monthlyAmount ? planSavingsPercent(amount, months, monthlyAmount) : 0;
      return <article className="plan-offer" key={months} aria-current={current || undefined}>
        <div className="plan-heading"><h2>{p.term(months)}</h2>{current && currentBadge}</div>
        <p className="plan-price">{planAmount(language, trialOffer ? 0 : amount)}</p>
        <div className="plan-billing-terms">
          <p>{trialOffer ? p.trial.after(planAmount(language, amount)) : p.interval(months)}</p>
          {savings > 0 && <p className="plan-savings">{p.savings(savings)}</p>}
        </div>
        <div className="plan-action">{renderAction(offer)}</div>
        {trialOffer && <p className="text-sm text-muted">{p.trial.register} {p.trial.cancel}</p>}
        <ul className="plan-benefits" role="list">{benefits.map(benefit =>
          <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
        )}</ul>
      </article>;
    })}
  </div>;
}
