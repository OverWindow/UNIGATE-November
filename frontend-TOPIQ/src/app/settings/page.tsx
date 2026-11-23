import SiteFooter from "@/components/SiteFooter";
import SiteHeader from "@/components/SiteHeader";
import { landingContent } from "@/lib/landing-content";
import { requestLanguage } from "@/lib/seo";

async function settingsTitle() {
  const language = await requestLanguage();
  return landingContent[language].footer.settings;
}

export async function generateMetadata() {
  return { title: `${await settingsTitle()} | TOPIQ` };
}

export default async function SettingsPage() {
  return (
    <div className="flex min-h-svh flex-col">
      <SiteHeader />
      <main id="main-content" className="page-container section-space flex-1" tabIndex={-1}>
        <h1 className="section-heading">{await settingsTitle()}</h1>
      </main>
      <SiteFooter />
    </div>
  );
}
