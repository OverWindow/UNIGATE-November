"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins } from "lucide-react";
import { useEffect } from "react";
import { useApp } from "@/app/providers";
import { creditsContent } from "@/lib/credits-content";

export default function WritingCreditBadge() {
  const pathname = usePathname();
  const { language, user, status, creditBalance, refreshCredits } = useApp();
  const visible = status === "authenticated" && !!user && pathname !== "/writing/history" && !pathname.startsWith("/writing/history/");

  useEffect(() => {
    if (!visible) return;
    const controller = new AbortController();
    const refresh = () => { void refreshCredits(controller.signal).catch(() => {}); };
    refresh();
    window.addEventListener("focus", refresh, { signal: controller.signal });
    return () => controller.abort();
  }, [visible, user?.id, pathname, refreshCredits]);

  if (!visible) return null;

  const t = creditsContent[language];
  const amount = creditBalance?.available.toLocaleString(language) ?? "—";

  return <Link className="writing-credit-badge" href="/credits"
    title={t.available} aria-label={`${t.available}: ${amount} ${t.unit} · ${t.transactions}`}>
    <Coins size={19} aria-hidden="true" />
    <span aria-live="polite"><strong>{amount}</strong> {t.unit}</span>
  </Link>;
}
