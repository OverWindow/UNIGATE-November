import type { Metadata } from "next";
import { headers } from "next/headers";
import type { Language } from "@/lib/landing-content";
import { localizedPath, seoOrigin } from "@/lib/locale-path";

export async function requestLanguage(): Promise<Language> {
  const value = (await headers()).get("x-topiq-locale");
  return value === "en" || value === "id" ? value : "ko";
}

export async function seoMetadata(
  path: string,
  copy: Record<Language, { title: string; description: string }>,
): Promise<Metadata> {
  const language = await requestLanguage();
  const { title, description } = copy[language];
  const canonical = localizedPath(path, language);
  return {
    title,
    description,
    alternates: {
      canonical,
      languages: {
        "ko-KR": localizedPath(path, "ko"),
        en: localizedPath(path, "en"),
        id: localizedPath(path, "id"),
        "x-default": localizedPath(path, "ko"),
      },
    },
    openGraph: { title, description, url: `${seoOrigin}${canonical}`, locale: language === "ko" ? "ko_KR" : language === "en" ? "en_US" : "id_ID" },
  };
}
