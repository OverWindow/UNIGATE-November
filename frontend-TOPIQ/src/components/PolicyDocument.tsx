"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";
import type { Language } from "@/lib/landing-content";

type PolicyCopy = {
  intro: string;
  draft: string;
  sections: { title: string; paragraphs: string[]; link?: { href: string; label: string } }[];
};

const draftLabel = { ko: "검토 중인 초안", en: "Draft for review", id: "Draf untuk ditinjau" };
const contactLabel = { ko: "개인정보·탈퇴·결제·환불 문의", en: "Privacy, account closure, payments and refunds", id: "Kontak privasi, penutupan akun, pembayaran, dan pengembalian dana" };
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
      <Link className="settings-back" href="/settings">
        <ChevronLeft size={16} aria-hidden="true" />{labels.settings}
      </Link>
      <h1 id="policy-title">{labels[kind]}</h1>
      <div className="licenses-intro">
        <p>{document.intro}</p>
        <p>{contactLabel[language]} · <a href={`mailto:${contactEmail}`}>{contactEmail}</a></p>
      </div>
      <aside className="licenses-data" aria-labelledby="draft-title">
        <h2 id="draft-title">{draftLabel[language]}</h2>
        <p>{document.draft}</p>
      </aside>
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
