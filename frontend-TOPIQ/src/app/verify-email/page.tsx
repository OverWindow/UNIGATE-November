import { Suspense } from "react";
import type { Metadata } from "next";
import EmailVerificationScreen from "@/components/EmailVerificationScreen";

export const metadata: Metadata = {
  title: "이메일 인증 | TOPIQ",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="auth-main">TOPIQ</main>}><EmailVerificationScreen /></Suspense>;
}
