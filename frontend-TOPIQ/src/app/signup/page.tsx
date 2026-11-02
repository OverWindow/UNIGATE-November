import { Suspense } from "react";
import type { Metadata } from "next";
import AuthScreen from "@/components/AuthScreen";

export const metadata: Metadata = { title: "회원가입 | TOPIQ" };

export default function SignupPage() {
  return <Suspense fallback={<main className="auth-main">TOPIQ</main>}><AuthScreen mode="signup" /></Suspense>;
}
