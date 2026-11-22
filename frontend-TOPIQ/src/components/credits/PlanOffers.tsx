import type { ReactNode } from "react";
import { Check } from "lucide-react";
import type { Language } from "@/lib/landing-content";
import { plansContent, publicPlans } from "@/lib/plans-content";
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

  return <div className="plan-offers">
    <article className="plan-offer plan-free" aria-current={isFree || undefined}>
      <div className="plan-heading"><h2>Free</h2>{isFree && currentBadge}</div>
      <p className="plan-price">{price.format(0)}</p>
      <ul className="plan-benefits" role="list">{p.freeBenefits.map(benefit =>
        <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
      )}</ul>
    </article>
    {(account?.plans ?? publicPlans).map(offer => {
      const { months, amount, bonusCredits } = offer;
      const current = account?.currentPlanMonths === months;
      const subscription = account?.subscription?.months === months ? account.subscription : null;
      return <article className="plan-offer" key={months} aria-current={current || undefined}>
        <div className="plan-heading"><h2>{p.term(months)}</h2>{current && currentBadge}</div>
        <p className="plan-price">{price.format(amount)}<small>{p.interval(months)}</small></p>
        <ul className="plan-benefits" role="list">{p.benefits(bonusCredits).map(benefit =>
          <li key={benefit}><Check size={16} aria-hidden="true" /><span>{benefit}</span></li>
        )}</ul>
        {current && account.endsAt && <p className="plan-period">
          {subscription?.state === "active" ? p.renewal : p.until}{" "}
          <time dateTime={account.endsAt}>{new Date(account.endsAt).toLocaleString(language, { dateStyle: "long", timeStyle: "short" })}</time>
        </p>}
        {current && !account.subscription && <p>{p.prepaid}</p>}
        {subscription?.state === "ending" && <p>{p.ending}</p>}
        {subscription?.state === "past_due" && <p>{p.pastDue}</p>}
        {renderAction(offer)}
      </article>;
    })}
  </div>;
}
