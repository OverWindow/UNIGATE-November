import { Suspense } from "react";
import type { Metadata } from "next";
import AuthScreen from "@/components/AuthScreen";

export const metadata: Metadata = { title: "로그인 | TOPIQ" };

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-main">TOPIQ</main>}><AuthScreen mode="login" /></Suspense>;
}
