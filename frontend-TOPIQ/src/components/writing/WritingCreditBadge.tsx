"use client";

import Link from "next/link";
import { ChevronRight, Coins } from "lucide-react";
import { useApp } from "@/app/providers";
import { creditsContent } from "@/lib/credits-content";

export default function WritingCreditBadge() {
  const { language, creditBalance } = useApp();
  const t = creditsContent[language];
  const amount = creditBalance?.available.toLocaleString(language) ?? "—";

  return <Link className="writing-credit-badge" href="/credits"
    title={t.available} aria-label={`${t.available}: ${amount} ${t.unit} · ${t.transactions}`}>
    <Coins size={19} aria-hidden="true" />
    <span aria-live="polite"><strong>{amount}</strong> {t.unit}</span>
    <ChevronRight size={16} aria-hidden="true" />
  </Link>;
}
