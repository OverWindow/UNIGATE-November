import { seoMetadata } from "@/lib/seo";
import { seoCopy } from "@/lib/seo-content";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import OpenSourceLicenses from "@/components/OpenSourceLicenses";
import "./licenses.css";

export const generateMetadata = () => seoMetadata("/open-source-licenses", seoCopy.licenses);

export default async function Page() {
  const licenses = JSON.parse(await readFile(join(process.cwd(), "public/open-source/licenses.json"), "utf8"));
  return <><SiteHeader /><OpenSourceLicenses {...licenses} /><SiteFooter /></>;
}
