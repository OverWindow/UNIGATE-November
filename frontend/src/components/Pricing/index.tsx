"use client";

import SectionTitle from "../Common/SectionTitle";
import PricingBox from "./PricingBox";
import OfferList from "./OfferList";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { ScrollReveal } from "@/hooks/useInView";

const Pricing = () => {
  const t = useTranslation();
  const entry = t.pricing.entry;
  const semester = t.pricing.semester;

  return (
    <section
      id="pricing"
      className="relative z-10 pt-10 pb-10 md:pt-12 md:pb-12 lg:pt-16 lg:pb-14"
    >
      <div className="container">
        <ScrollReveal>
          <SectionTitle
            title={t.pricing.title}
            paragraph={<>{t.pricing.paragraph}</>}
            center
            width="665px"
          />
        </ScrollReveal>

        <div className="grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-2">
          <ScrollReveal delay={100}>
            <PricingBox
              badge={entry.badge}
              packageName={entry.packageName}
              priceLabel={entry.priceLabel}
              subtitle={entry.subtitle}
              ctaLabel={entry.cta}
              ctaHref="https://lms.unigate.kr/lms"
              ctaVariant="primary"
              note={entry.note}
            >
              {entry.features.map((text, i) => (
                <OfferList key={i} text={text} status={i < 2 ? "active" : "inactive"} />
              ))}
            </PricingBox>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <PricingBox
              isFeatured
              badge={semester.badge}
              packageName={semester.packageName}
              priceLabel={
                <>
                  {semester.priceLabel}
                  <span className="ml-1 text-sm font-normal opacity-70">
                    {semester.priceUnit}
                  </span>
                </>
              }
              subtitle={semester.subtitle}
              ctaLabel={semester.cta}
              ctaHref="#partners"
              ctaVariant="outline"
              note={semester.note}
              recommendedLabel={semester.recommended}
            >
              {semester.features.map((text, i) => (
                <OfferList key={i} text={text} status="active" />
              ))}
            </PricingBox>
          </ScrollReveal>
        </div>
      </div>
    </section>
  );
};

export default Pricing;
