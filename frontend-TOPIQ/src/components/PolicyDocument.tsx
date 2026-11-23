"use client";

import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import { billingEmail } from "@/lib/credits-content";
import type { Language } from "@/lib/landing-content";

type PolicyCopy = {
  intro: string;
  sections: { title: string; paragraphs: string[]; link?: { href: string; label: string } }[];
};

const contactLabel = { ko: "개인정보·탈퇴 문의", en: "Privacy and account closure", id: "Privasi dan penutupan akun" };
const billingLabel = { ko: "결제·환불 문의", en: "Payments and refunds", id: "Pembayaran dan pengembalian dana" };
const contactEmail = "overwindow@unigate.kr";

export default function PolicyDocument({ kind, copy }: {
  kind: "privacy" | "terms";
  copy: Record<Language, PolicyCopy>;
}) {
  const { language } = useApp();
  const labels = authContent[language];
  const document = copy[language];
  return (
    <article aria-labelledby="policy-title">
      <h1 id="policy-title">{labels[kind]}</h1>
      <div className="licenses-intro">
        <p>{document.intro}</p>
        <p>{contactLabel[language]} · <a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>
        <p>{billingLabel[language]} · <a href={`mailto:${billingEmail}`}>{billingEmail}</a></p>
      </div>
      {document.sections.map(({ title, paragraphs, link }) => (
        <section key={title} className="licenses-entry">
          <h2>{title}</h2>
          {paragraphs.map(paragraph => <p key={paragraph}>{paragraph}</p>)}
          {link && <a href={link.href}>{link.label}</a>}
        </section>
      ))}
    </article>
  );
}
