import type { Metadata } from "next";
import ComingSoonPage from "@/components/ComingSoonPage";
import { landingContent } from "@/lib/landing-content";

export const metadata: Metadata = {
  title: "TOPIQ | TOPIK II IBT 준비 중",
  description: landingContent.ko.comingSoon.message,
};

export default function IbtPage() {
  return <ComingSoonPage />;
}
