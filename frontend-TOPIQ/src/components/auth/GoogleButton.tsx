"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { AuthError, startGoogle, verifyGoogle, type GoogleStep } from "@/lib/auth/auth-api";
import { authContent } from "@/lib/auth/auth-content";

interface GoogleId {
  initialize(options: { client_id: string; nonce: string; callback: (result: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: { type: "standard"; text: "continue_with"; locale: string }): void;
}

declare global {
  interface Window { google?: { accounts?: { id?: GoogleId } } }
}

export default function GoogleButton({ onStep }: { onStep: (step: GoogleStep) => void }) {
  const { language, refreshSession } = useApp();
  const t = authContent[language];
  const host = useRef<HTMLDivElement>(null);
  const initial = useRef<ReturnType<typeof startGoogle> | null>(null);
  const [config, setConfig] = useState<Awaited<ReturnType<typeof startGoogle>>>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    initial.current ??= startGoogle();
    void initial.current.then(result => { if (active) setConfig(result); }).catch(failure => {
      if (active) setError(failure instanceof AuthError ? failure.code : "google_unavailable");
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready || !config || !host.current) return;
    const element = host.current;
    const id = window.google?.accounts?.id;
    if (!id) { setError("google_unavailable"); return; }
    let active = true;
    let submitted = false;
    id.initialize({ client_id: config.clientId, nonce: config.nonce, callback: async ({ credential }) => {
      if (!active || submitted) return;
      submitted = true;
      setBusy(true);
      try {
        const result = await verifyGoogle(credential);
        if (!active) return;
        if ("step" in result) onStep(result);
        else await refreshSession();
      } catch (failure) {
        if (active) setError(failure instanceof AuthError ? failure.code : "google_unavailable");
      } finally { if (active) setBusy(false); }
    } });
    id.renderButton(element, { type: "standard", text: "continue_with", locale: language });
    return () => { active = false; element.replaceChildren(); };
  }, [ready, config, onStep, language, refreshSession]);

  if (error) return <div className="auth-error" role="alert">
    <p>{t.errors[error] || t.errors.google_unavailable}</p>
    <button type="button" className="text-link" onClick={() => window.location.reload()}>{t.retry}</button>
  </div>;
  if (!config) return null;
  return <div className="auth-google" aria-busy={busy}>
    <Script src="https://accounts.google.com/gsi/client" onReady={() => setReady(true)} onError={() => setError("google_unavailable")} />
    <div ref={host} hidden={busy} />
    {busy && <span role="status">{t.submitting}</span>}
  </div>;
}
