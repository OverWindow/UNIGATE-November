"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useApp } from "@/app/providers";

export default function WritingAccess({ children }: { children: ReactNode }) {
  const { user, status, language, refreshSession } = useApp();
  const pathname = usePathname();
  const copy = {
    ko: ["로그인 확인 중입니다.", "쓰기 튜터는 로그인 후 이용할 수 있습니다.", "로그인", "로그인 상태를 확인하지 못했습니다.", "다시 확인"],
    en: ["Checking your session…", "Sign in to use the writing tutor.", "Sign in", "Unable to check your session.", "Try again"],
    id: ["Memeriksa sesi…", "Masuk untuk menggunakan tutor menulis.", "Masuk", "Sesi tidak dapat diperiksa.", "Coba lagi"],
  }[language];
  if (status === "loading") return <p className="writing-status" role="status">{copy[0]}</p>;
  if (status === "error") return <div className="writing-status" role="alert"><p>{copy[3]}</p><button className="button writing-secondary" onClick={() => void refreshSession()}>{copy[4]}</button></div>;
  if (!user) return <div className="writing-status"><p>{copy[1]}</p><Link className="button button-primary" href={`/login?next=${encodeURIComponent(pathname)}`}>{copy[2]}</Link></div>;
  return <div key={user.id}>{children}</div>;
}
