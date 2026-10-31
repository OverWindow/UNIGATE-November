"use client";

import { Feature } from "@/types/feature";
import { useTranslation } from "@/lib/i18n/LanguageContext";

const SingleFeature = ({
  feature,
  index,
}: {
  feature: Feature;
  index: number;
}) => {
  const { title, paragraph } = feature;
  const t = useTranslation();

  return (
    <div className="relative h-full">
      <div className="group flex h-full flex-col rounded-2xl border border-black/10 bg-white p-6 shadow-sm transition-all duration-300 ease-out hover:z-10 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/10">
        <div className="mb-4 flex items-center">
          <span className="text-xs font-semibold tracking-wide text-black/40 transition-colors duration-300 group-hover:text-black/60">
            {`${t.features.semesterLabel} ${index + 1}`}
          </span>
        </div>

        <h3 className="group-hover:text-primary mb-3 text-lg font-bold text-black transition-colors duration-300">
          {title}
        </h3>

        <p className="flex-1 text-sm leading-relaxed text-black/60 transition-colors duration-300 group-hover:text-black/70">
          {paragraph}
        </p>
      </div>
    </div>
  );
};

export default SingleFeature;
