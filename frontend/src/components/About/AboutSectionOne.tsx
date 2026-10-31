"use client";

import Image from "next/image";
import SectionTitle from "../Common/SectionTitle";
import { useTranslation } from "@/lib/i18n/LanguageContext";
import { ScrollReveal } from "@/hooks/useInView";

const AboutSectionOne = () => {
  const t = useTranslation();
  const cards = t.about.cards;

  return (
    <section id="about" className="pt-16 md:pt-20 lg:pt-28">
      <div className="container">
        <div className="border-body-color/[.15] border-b pb-16 md:pb-20 lg:pb-28">
          <div className="-mx-4 flex flex-wrap items-center">
            <div className="w-full px-4 lg:w-1/2">
              <ScrollReveal>
                <SectionTitle
                  title={t.about.title}
                  paragraph={t.about.paragraph}
                  center
                  mb="44px"
                />
              </ScrollReveal>

              <div className="mx-auto mb-12 max-w-[570px] lg:mb-0">
                <div className="grid gap-4 sm:grid-cols-2">
                  {cards.map((card, index) => (
                    <ScrollReveal key={index} delay={index * 80} className="h-full">
                      <div
                        className="group flex h-full flex-col border-body-color/[.15] rounded-2xl border bg-white/60 p-5 transition hover:-translate-y-0.5 hover:shadow-lg  "
                      >
                        <div className="mb-3 flex items-center">
                          <span className="bg-primary/10 text-primary inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold">
                            {card.badge}
                          </span>
                        </div>
                        <p className="text-dark mb-2 text-base font-semibold ">
                          {card.title}
                        </p>
                        <p className="text-body-color flex-1 text-sm leading-relaxed">
                          {card.description}
                        </p>
                      </div>
                    </ScrollReveal>
                  ))}
                </div>
              </div>
            </div>

            <div className="w-full px-4 lg:w-1/2">
              <ScrollReveal delay={200} direction="right">
                <div className="relative mx-auto aspect-25/24 max-w-[600px] lg:mr-0">
                  <Image
                    src="/images/about/textbook.jpg"
                    alt={t.about.imageAlt}
                    fill
                    className="drop-shadow-three object-contain"
                  />
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSectionOne;
