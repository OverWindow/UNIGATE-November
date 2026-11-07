import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import "./vocabulary.css";

export default function VocabularyLayout({ children }: { children: ReactNode }) {
  return <><SiteHeader /><main id="main-content" className="vocabulary-main" tabIndex={-1}>{children}</main><SiteFooter /></>;
}
