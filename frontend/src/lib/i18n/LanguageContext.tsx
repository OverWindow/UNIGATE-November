"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import {
  Language,
  Translations,
  getTranslation,
  translations,
} from "./translations";

const STORAGE_KEY = "unigate-language";
const DEFAULT_LANG: Language = "id";

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(
  undefined,
);

function isValidLanguage(value: string): value is Language {
  return value === "id" || value === "ko" || value === "en";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Language>(DEFAULT_LANG);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Restore browser preference after hydration to match the static HTML.
    // oxlint-disable-next-line react/set-state-in-effect
    setMounted(true);
    let stored: string | null = null;
    try { stored = localStorage.getItem(STORAGE_KEY); } catch { /* Storage may be disabled. */ }
    if (stored && isValidLanguage(stored)) {
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    if (mounted && typeof document !== "undefined") {
      document.documentElement.lang = lang;
    }
  }, [lang, mounted]);

  const setLang = (next: Language) => {
    setLangState(next);
    if (typeof window !== "undefined") {
      try { localStorage.setItem(STORAGE_KEY, next); } catch { /* Keep in-memory selection. */ }
    }
  };

  const t = getTranslation(lang);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}

export function useTranslation(): Translations {
  return useLanguage().t;
}

export { translations };
export type { Language };
