"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { AuthError, startGoogle, verifyGoogle, type GoogleStep } from "@/lib/auth/auth-api";
import { authContent } from "@/lib/auth/auth-content";
import { csrfToken } from "@/lib/csrf";

interface GoogleId {
  initialize(options: { client_id: string; nonce: string; callback: (result: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: { type: "standard"; size: "medium"; text: "signin_with"; locale: string; width: string }): void;
}

type Verification = ReturnType<typeof verifyGoogle>;

interface GoogleSignIn {
  client: Promise<GoogleId | null>;
  needsNewChallenge?: () => boolean;
  verification?: Verification;
  onVerification?: (verification: Verification) => void;
  consumed?: boolean;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
    topiqGoogleSignIn?: GoogleSignIn;
  }
}

async function initializeGoogle() {
  // The Google start endpoint gives its challenge a ten-minute lifetime.
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const config = await startGoogle();
  const signIn = window.topiqGoogleSignIn;
  if (!config || !signIn) return null;
  const sessionToken = csrfToken;
  signIn.needsNewChallenge = () => Date.now() >= expiresAt || csrfToken !== sessionToken;
  const script = document.createElement("script");
  script.id = "topiq-google-identity";
  script.src = `https://accounts.google.com/gsi/client?hl=${encodeURIComponent(document.documentElement.lang)}`;
  await new Promise<void>((resolve, reject) => {
    script.onload = () => resolve();
    script.onerror = () => { script.remove(); reject(new AuthError("google_unavailable")); };
    document.head.appendChild(script);
  });
  const id = window.google?.accounts?.id;
  if (!id) throw new AuthError("google_unavailable");
  id.initialize({ client_id: config.clientId, nonce: config.nonce, callback: ({ credential }) => {
    if (!signIn.onVerification || signIn.verification || signIn.consumed) return;
    signIn.verification = verifyGoogle(credential);
    signIn.onVerification(signIn.verification);
  } });
  return id;
}

export default function GoogleButton({ onStep }: { onStep: (step: GoogleStep) => void }) {
  const { language, refreshSession } = useApp();
  const t = authContent[language];
  const host = useRef<HTMLDivElement>(null);
  const [client, setClient] = useState<GoogleId | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const finishSignIn = useEffectEvent(async (result: Awaited<Verification>) => {
    if ("step" in result) onStep(result);
    else await refreshSession();
  });

  useEffect(() => {
    // The SDK and its one-time nonce belong to the document, across auth routes.
    const signIn: GoogleSignIn = window.topiqGoogleSignIn ??= { client: initializeGoogle() };
    if (signIn.consumed || (!signIn.verification && signIn.needsNewChallenge?.())) {
      window.location.reload();
      return;
    }
    let active = true;
    async function handleVerification(verification: Verification) {
      setBusy(true);
      try {
        const result = await verification;
        if (active) await finishSignIn(result);
      } catch (failure) {
        if (active) setError(failure instanceof AuthError ? failure.code : "google_unavailable");
      } finally {
        if (active || !signIn.onVerification) {
          signIn.consumed = true;
          delete signIn.verification;
        }
        if (active) setBusy(false);
      }
    }
    signIn.onVerification = handleVerification;
    if (signIn.verification) void handleVerification(signIn.verification);
    void signIn.client.then(client => {
      if (!client && window.topiqGoogleSignIn === signIn) delete window.topiqGoogleSignIn;
      if (active) setClient(client);
    }).catch(failure => {
      if (window.topiqGoogleSignIn === signIn) delete window.topiqGoogleSignIn;
      if (active) setError(failure instanceof AuthError ? failure.code : "google_unavailable");
    });
    return () => {
      active = false;
      if (signIn.onVerification === handleVerification) delete signIn.onVerification;
    };
  }, []);

  useEffect(() => {
    if (!client || busy || error || !host.current) return;
    const element = host.current;
    let active = true;
    let renderedWidth = 0;
    const observer = new ResizeObserver(([entry]) => {
      const width = Math.ceil(entry.contentRect.width);
      if (!width || width === renderedWidth) return;
      renderedWidth = width;
      element.replaceChildren();
      // Google's medium button omits the returning user's name and photo.
      client.renderButton(element, {
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
  }, [client, busy, error, language, t]);

  if (error) return <div className="auth-error" role="alert">
    <p>{t.errors[error] || t.errors.google_unavailable}</p>
    <button type="button" className="text-link" onClick={() => window.location.reload()}>{t.retry}</button>
  </div>;
  if (!client) return null;
  return <div className="auth-google" aria-busy={busy}>
    <div className="auth-google-button" hidden={busy}>
      <div key={language} className="auth-google-surface" ref={host} />
      {language === "ko" && <span className="auth-google-label" aria-hidden="true">{t.googleSignIn}</span>}
    </div>
    {busy && <span role="status">{t.submitting}</span>}
  </div>;
}
