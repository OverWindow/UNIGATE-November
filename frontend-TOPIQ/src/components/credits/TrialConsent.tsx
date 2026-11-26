import { useId, useState } from "react";
import { useApp } from "@/app/providers";
import { billingTime, planAmount, plansContent } from "@/lib/plans-content";
import type { TrialQuote } from "@/lib/writing/writing-api";

export default function TrialConsent({ quote, busy, onConfirm }: {
  quote: TrialQuote; busy: boolean; onConfirm: () => void;
}) {
  const { language } = useApp();
  const p = plansContent[language];
  const [agreed, setAgreed] = useState(false);
  const heading = useId();
  return <form className="trial-consent" aria-labelledby={heading} onSubmit={event => {
    event.preventDefault();
    if (agreed && !busy) onConfirm();
  }}>
    <h2 id={heading}>{p.trial.confirm}</h2>
    <dl>
      <div><dt>{p.change.today}</dt><dd>{planAmount(language, 0)}</dd></div>
      <div><dt>{p.trial.firstCharge}</dt><dd><time dateTime={quote.endsAt}>{billingTime(language, quote.endsAt)}</time></dd></div>
      <div><dt>{p.change.nextCharge}</dt><dd>{planAmount(language, quote.amount)} · {p.interval(1)}</dd></div>
      <div><dt>{p.trial.method}</dt><dd>{p.trial.card}</dd></div>
    </dl>
    <p>{p.trial.cancel}</p>
    <label><input type="checkbox" required checked={agreed} disabled={busy} onChange={event => setAgreed(event.target.checked)} />{p.trial.agree}</label>
    <button type="submit" className="button button-primary" disabled={busy || !agreed}>{p.trial.start}</button>
  </form>;
}
