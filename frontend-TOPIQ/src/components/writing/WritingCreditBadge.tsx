"use client";

import Link from "next/link";
import { Coins } from "lucide-react";
import { useApp } from "@/app/providers";
import { creditsContent } from "@/lib/credits-content";

export default function WritingCreditBadge() {
  const { language, user, creditBalance } = useApp();
  const t = creditsContent[language];
  const amount = creditBalance?.available.toLocaleString(language) ?? "—";
  if (!user) return null;

  return <Link className="writing-credit-badge" href="/credits"
    title={t.available} aria-label={`${t.available}: ${amount} ${t.unit} · ${t.transactions}`}>
    <Coins size={19} aria-hidden="true" />
    <span aria-live="polite"><strong>{amount}</strong> {t.unit}</span>
  </Link>;
}
