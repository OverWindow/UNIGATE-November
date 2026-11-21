"use client";

import Link from "next/link";
import { ChevronRight, FileText, ShieldCheck } from "lucide-react";
import { useApp } from "@/app/providers";
import { authContent } from "@/lib/auth/auth-content";

export default function SettingsPage() {
  const { language } = useApp();
  const labels = authContent[language];

  return (
    <>
      <h1 id="settings-title">{labels.settings}</h1>
      <nav className="settings-nav" aria-labelledby="settings-title">
        <Link href="/settings/privacy">
          <ShieldCheck size={20} aria-hidden="true" />
          {labels.privacy}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
        <Link href="/settings/terms">
          <FileText size={20} aria-hidden="true" />
          {labels.terms}
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      </nav>
    </>
  );
}
