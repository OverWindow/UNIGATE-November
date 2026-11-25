import type { Language } from "@/lib/landing-content";

export const seoOrigin = "https://topiq.unigate.kr";

export function localizedPath(path: string, language: Language) {
  return language === "ko" ? path : `/${language}${path === "/" ? "" : path}`;
}

export function unlocalizedPath(path: string) {
  return path.replace(/^\/(en|id)(?=\/|$)/, "") || "/";
}

export function isPasswordConfirmPath(pathname: string) {
  return /^\/password\/confirm\/?$/.test(unlocalizedPath(pathname));
}
