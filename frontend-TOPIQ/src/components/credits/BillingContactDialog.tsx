import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { billingEmail, paymentHistoryContent } from "@/lib/credits-content";

export default function BillingContactDialog({ orderId, onDismiss }: { orderId: string; onDismiss: () => void }) {
  const { language } = useApp();
  const p = paymentHistoryContent[language].inquiry;
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [manualCopy, setManualCopy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    heading.current?.focus({ preventScroll: true });
    return () => element?.close();
  }, []);

  function dismiss() {
    dialog.current?.close();
    onDismiss();
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(value);
      setManualCopy(false);
    } catch {
      setCopied(null);
      setManualCopy(true);
    }
  }

  return <dialog className="billing-contact-dialog" ref={dialog} aria-labelledby="billing-contact-title"
    aria-describedby="billing-contact-instructions" onCancel={event => { event.preventDefault(); dismiss(); }}>
    <h2 ref={heading} tabIndex={-1} id="billing-contact-title">{paymentHistoryContent[language].contact}</h2>
    <p id="billing-contact-instructions">{p.instructions}</p>
    <dl>{[{ label: p.email, value: billingEmail }, { label: p.order, value: orderId }].map(({ label, value }) =>
      <div key={value}>
        <dt>{label}</dt>
        <dd><span className="billing-contact-value" tabIndex={0}
            onFocus={event => window.getSelection()?.selectAllChildren(event.currentTarget)}>{value}</span>
          <button type="button" className="button credits-secondary" aria-label={`${label} · ${copied === value ? p.copied : p.copy}`}
            onClick={() => void copy(value)}>{copied === value ? p.copied : p.copy}</button>
        </dd>
      </div>)}</dl>
    <p role="status" className={manualCopy ? "billing-contact-copy-help" : "sr-only"}>
      {manualCopy ? p.manualCopy : copied && `${copied === billingEmail ? p.email : p.order} · ${p.copied}`}
    </p>
    <p className="billing-contact-example">{p.example}</p>
    <button className="button button-primary" type="button" onClick={dismiss}>{p.close}</button>
  </dialog>;
}
