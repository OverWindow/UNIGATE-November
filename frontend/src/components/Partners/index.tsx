"use client";

import { useTranslation } from "@/lib/i18n/LanguageContext";
import { ScrollReveal } from "@/hooks/useInView";

const Partners = () => {
  const t = useTranslation();

  return (
    <section id="partners" className="py-16 md:py-20 lg:py-28">
      <div className="container">
        <ScrollReveal>
          <div className="mx-auto max-w-[800px] text-center">
            <h2 className="mb-4 text-3xl leading-tight! font-bold text-black sm:text-4xl">
              {t.partners.title}
            </h2>
            <p className="text-body-color text-base leading-relaxed! md:text-lg">
              {t.partners.description}
            </p>
          </div>
        </ScrollReveal>

        <div className="mt-16 min-h-[200px] rounded-2xl border border-dashed border-black/15 bg-black/[0.02]" />
      </div>
    </section>
  );
};

export default Partners;
