import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import WritingAccess from "@/components/writing/WritingAccess";
import "./writing.css";

export default function WritingLayout({ children }: { children: ReactNode }) {
  return <><SiteHeader /><main id="main-content" className="writing-main" tabIndex={-1}><WritingAccess>{children}</WritingAccess></main><SiteFooter /></>;
}
