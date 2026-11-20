import type { Metadata } from "next";
import { Suspense } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CreditsAccount from "@/components/credits/CreditsAccount";
import "./credits.css";

export const metadata: Metadata = { title: "내 크레딧 | TOPIQ" };

export default function CreditsPage() {
  return <><SiteHeader /><main id="main-content" className="credits-main" tabIndex={-1}><Suspense><CreditsAccount /></Suspense></main><SiteFooter /></>;
}
