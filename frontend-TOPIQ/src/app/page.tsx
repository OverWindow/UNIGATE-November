import type { Metadata } from "next";
import LandingPage from "@/components/LandingPage";

export const metadata: Metadata = {
  title: "UNIGATE TOPIQ | TOPIK II 모의고사",
  description: "TOPIK II 읽기와 듣기 50문항을 실전 또는 연습 모드로 풀고, 정확한 응답 분석과 오답 해설을 확인하세요.",
};

export default function Home() {
  return <LandingPage />;
}
