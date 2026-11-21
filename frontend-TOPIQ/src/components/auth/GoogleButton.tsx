"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { AuthError, startGoogle, verifyGoogle, type GoogleStep } from "@/lib/auth/auth-api";
import { authContent } from "@/lib/auth/auth-content";

interface GoogleId {
  initialize(options: { client_id: string; nonce: string; callback: (result: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: { type: "standard"; size: "medium"; text: "signin_with"; locale: string; width: string }): void;
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
    let renderedWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.ceil(entry.contentRect.width);
      if (!width || width === renderedWidth || submitted) return;
      renderedWidth = width;
      element.replaceChildren();
      // Google's medium button omits the returning user's name and photo.
      id.renderButton(element, {
        type: "standard", size: "medium", text: "signin_with", locale: language, width: String(width),
      });
      // The inline button uses the SDK's initial language until the localized iframe loads.
      const button = element.querySelector('[role="button"][aria-labelledby]');
      const label = button?.querySelector("span:not([id])");
      const accessibleLabel = button?.querySelector("span[id]");
      if (label && accessibleLabel && label.textContent !== t.googleSignIn) {
        label.textContent = t.googleSignIn;
        accessibleLabel.textContent = `${t.googleSignIn}. ${t.opensInNewTab}`;
      }
    });
    observer.observe(element);
    // Chrome doesn't propagate :focus-within from Google's cross-origin iframe.
    function syncFrameFocus() {
      requestAnimationFrame(() => {
        const focused = document.activeElement;
        if (active) element.toggleAttribute("data-frame-focus",
          document.hasFocus() && focused instanceof HTMLIFrameElement && element.contains(focused));
      });
    }
    window.addEventListener("blur", syncFrameFocus);
    window.addEventListener("focus", syncFrameFocus);
    return () => {
      active = false;
      window.removeEventListener("blur", syncFrameFocus);
      window.removeEventListener("focus", syncFrameFocus);
      element.removeAttribute("data-frame-focus");
      observer.disconnect();
      element.replaceChildren();
    };
  }, [ready, config, onStep, language, refreshSession, t]);

  if (error) return <div className="auth-error" role="alert">
    <p>{t.errors[error] || t.errors.google_unavailable}</p>
    <button type="button" className="text-link" onClick={() => window.location.reload()}>{t.retry}</button>
  </div>;
  if (!config) return null;
  return <div className="auth-google" aria-busy={busy}>
    <Script id="topiq-google-identity" src={`https://accounts.google.com/gsi/client?hl=${language}`}
      onReady={() => setReady(true)} onError={() => setError("google_unavailable")} />
    <div className="auth-google-button" hidden={busy}>
      <div key={language} className="auth-google-surface" ref={host} />
      {language === "ko" && <span className="auth-google-label" aria-hidden="true">{t.googleSignIn}</span>}
    </div>
    {busy && <span role="status">{t.submitting}</span>}
  </div>;
}
