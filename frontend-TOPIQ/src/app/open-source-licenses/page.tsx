import type { Metadata } from "next";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import OpenSourceLicenses from "@/components/OpenSourceLicenses";
import "./licenses.css";

export const metadata: Metadata = {
  title: "오픈소스 라이선스 | TOPIQ",
  description: "TOPIQ에서 사용하는 오픈소스 소프트웨어와 사전 데이터의 출처 및 이용조건입니다.",
};
export const dynamic = "force-static";

export default async function Page() {
  const licenses = JSON.parse(await readFile(join(process.cwd(), "public/open-source/licenses.json"), "utf8"));
  return <><SiteHeader /><OpenSourceLicenses {...licenses} /><SiteFooter /></>;
}
