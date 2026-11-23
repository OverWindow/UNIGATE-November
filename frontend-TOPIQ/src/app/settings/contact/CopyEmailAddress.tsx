"use client";

import { useState } from "react";
import { contactContent } from "@/lib/contact-content";
import type { Language } from "@/lib/landing-content";

export default function CopyEmailAddress({ email, language }: { email: string; language: Language }) {
  const labels = contactContent[language];
  const [feedback, setFeedback] = useState<"copied" | "manualCopy" | null>(null);

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(email);
      setFeedback("copied");
    } catch {
      setFeedback("manualCopy");
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3">
        <span className="select-all break-all">{email}</span>
        <button type="button" className="text-link min-h-11" aria-label={`${labels.copy} · ${email}`}
          onClick={copyAddress}>{labels.copy}</button>
      </div>
      <p role="status" className="text-sm text-muted">{feedback && labels[feedback]}</p>
    </div>
  );
}
