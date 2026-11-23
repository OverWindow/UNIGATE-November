import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import LandingPage from "@/components/landing/LandingPage";

export const generateMetadata = () => seoMetadata("/", seoCopy.home);

export default function Home() {
  return <LandingPage />;
}
