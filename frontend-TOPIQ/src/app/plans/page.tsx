import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import { Suspense } from "react";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PlansAccount from "@/components/credits/PlansAccount";
import "../credits/credits.css";
import "./plans.css";

export const generateMetadata = () => seoMetadata("/plans", seoCopy.plans);

export default function PlansPage() {
  return <><SiteHeader /><main id="main-content" className="credits-main" tabIndex={-1}>
    <Suspense><PlansAccount /></Suspense>
  </main><SiteFooter /></>;
}
