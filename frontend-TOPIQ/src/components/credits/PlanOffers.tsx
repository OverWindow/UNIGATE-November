import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { Language } from "@/lib/landing-content";
import { planSavingsPercent, plansContent, publicPlans } from "@/lib/plans-content";
import type { PlanAccount, PlanOffer } from "@/lib/writing/writing-api";

export default function PlanOffers({ language, account, renderAction }: {
  language: Language;
  account?: PlanAccount;
  renderAction: (offer: PlanOffer) => ReactNode;
}) {
  const p = plansContent[language];
  const price = new Intl.NumberFormat(language, { style: "currency", currency: "KRW" });
  const currentBadge = <span className="plan-current-badge">{p.current}</span>;
  const isFree = account?.active === false;
  const offers = account?.plans ?? publicPlans;
  const monthlyAmount = offers.find(offer => offer.months === 1)?.amount;

  return <div className="plan-offers">
    <article className="plan-offer plan-free" aria-current={isFree || undefined}>
      <div className="plan-heading"><h2>Free</h2>{isFree && currentBadge}</div>
      <p className="plan-price">{price.format(0)}</p>
      <ul className="plan-benefits" role="list">{p.freeBenefits.map(benefit =>
        <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
      )}</ul>
    </article>
    {offers.map(offer => {
      const { months, amount } = offer;
      const current = account?.currentPlanMonths === months;
      const savings = monthlyAmount ? planSavingsPercent(amount, months, monthlyAmount) : 0;
      return <article className="plan-offer" key={months} aria-current={current || undefined}>
        <div className="plan-heading"><h2>{p.term(months)}</h2>{current && currentBadge}</div>
        <p className="plan-price">{price.format(amount)}</p>
        <p className="plan-savings">{savings > 0 ? p.savings(savings) : "\u00a0"}</p>
        <div className="plan-action">{renderAction(offer)}</div>
        <ul className="plan-benefits" role="list">{p.benefits(offer.bonusCredits).map(benefit =>
          <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
        )}</ul>
      </article>;
    })}
  </div>;
}
