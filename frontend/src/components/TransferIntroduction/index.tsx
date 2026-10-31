"use client";

import TransferRequest from "@/components/TransferRequest";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { surveyTranslations } from "@/lib/i18n/survey";

export default function TransferIntroduction() {
  const { lang } = useLanguage();
  const t = surveyTranslations[lang];

  return (
    <section aria-labelledby="transfer-introduction-title" className="pt-16 md:pt-20 lg:pt-28">
      <div className="container">
        <div className="rounded-2xl border border-primary/10 bg-primary/5 px-6 py-10 text-center sm:px-10 sm:py-14">
          <h2 id="transfer-introduction-title" className="mx-auto max-w-3xl text-2xl leading-snug font-bold text-black sm:text-3xl md:text-4xl">
            {t.introTitle}
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-body-color sm:text-lg">
            {t.introDescription}
          </p>
          <TransferRequest />
        </div>
      </div>
    </section>
  );
}
