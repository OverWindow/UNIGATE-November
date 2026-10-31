"use client";

import { useLanguage, Language } from "@/lib/i18n/LanguageContext";

const languages: { code: Language; label: string }[] = [
  { code: "id", label: "Bahasa Indonesia" },
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
];

const LanguageSwitcher = () => {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex flex-wrap max-w-full w-fit items-center rounded-full border border-black/10 bg-black/5 p-1  ">
      {languages.map(({ code, label }) => {
        const active = lang === code;
        return (
          <button
            key={code}
            onClick={() => setLang(code)}
            aria-pressed={active}
            className={`rounded-full px-2 py-1.5 text-center text-xs font-semibold whitespace-nowrap transition ${
              active
                ? "bg-primary text-white shadow-sm"
                : "text-black/60 hover:text-black  "
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default LanguageSwitcher;
