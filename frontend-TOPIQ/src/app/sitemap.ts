import type { MetadataRoute } from "next";
import { localizedPath, seoOrigin } from "@/lib/locale-path";

const paths = ["/", "/pbt", "/ibt", "/vocabulary", "/writing", "/plans", "/privacy", "/terms", "/open-source-licenses"];

export default function sitemap(): MetadataRoute.Sitemap {
  return paths.flatMap(path => {
    const languages = {
      "ko-KR": `${seoOrigin}${localizedPath(path, "ko")}`,
      en: `${seoOrigin}${localizedPath(path, "en")}`,
      id: `${seoOrigin}${localizedPath(path, "id")}`,
    };
    return Object.values(languages).map(url => ({ url, alternates: { languages } }));
  });
}
