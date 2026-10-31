"use client";

import SectionTitle from "../Common/SectionTitle";
import SingleFeature from "./SingleFeature";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { ScrollReveal } from "@/hooks/useInView";

const Features = () => {
  const t = useTranslation();
  const featuresData = t.features.items;

  return (
    <section
      id="curriculum"
      className="pt-16 pb-10 md:pt-20 md:pb-12 lg:pt-28 lg:pb-14"
    >
      <div className="container">
        <ScrollReveal>
          <SectionTitle
            title={t.features.title}
            paragraph={<>{t.features.paragraph}</>}
            center
          />
        </ScrollReveal>

        <div className="relative mt-12">
          <div className="pointer-events-none absolute top-7 left-0 hidden h-px w-full bg-black/10 lg:block" />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
            {featuresData.map((feature, index) => (
              <ScrollReveal key={index} delay={index * 100}>
                <SingleFeature feature={{ ...feature, id: index + 1 }} index={index} />
              </ScrollReveal>
            ))}
          </div>
        </div>

        <div className="mt-16 h-px w-full bg-black/10" />
      </div>
    </section>
  );
};

export default Features;
