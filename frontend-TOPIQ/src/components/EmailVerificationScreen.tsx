"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { AuthError, verifyEmail, type VerifiedEmail } from "@/lib/auth-api";
import { authContent } from "@/lib/auth-content";
import { emailContent } from "@/lib/email-content";
import AuthScreen from "./AuthScreen";
import SiteHeader from "./SiteHeader";

export default function EmailVerificationScreen() {
  const { language, setLanguage } = useApp();
  const [verified, setVerified] = useState<VerifiedEmail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<VerifiedEmail> | null>(null);
  const lastToken = useRef<string | null>(null);
  const a = authContent[language];
  const t = emailContent[language];

  useEffect(() => { if (!verified) document.title = `${t.title} | TOPIQ`; }, [verified, t.title]);

  useEffect(() => {
    let active = true;
    let generation = 0;
    function checkLink() {
      const current = ++generation;
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (token !== lastToken.current) { request.current = null; lastToken.current = token; }
      setVerified(null);
      setError("");
      if (!request.current) request.current = token ? verifyEmail(token) : Promise.reject(new AuthError("email_verification_invalid"));
      void request.current.then((result) => {
        if (active && current === generation) { setLanguage(result.language); setVerified(result); }
      }).catch((failure: unknown) => {
        if (active && current === generation) setError(failure instanceof AuthError ? failure.code : "server_error");
      });
    }
    checkLink();
    window.addEventListener("hashchange", checkLink);
    return () => { active = false; window.removeEventListener("hashchange", checkLink); };
  }, [setLanguage, attempt]);

  if (verified) return <AuthScreen mode="signup" verification={verified} returnPath={verified.next} />;
  const canRetry = error === "network_error" || error === "server_error";
  return (
    <>
      <SiteHeader />
      <main className="auth-main" id="main-content" tabIndex={-1}>
        <div className="auth-card">
          <p className="eyebrow">TOPIQ / {a.signup}</p>
          <h1>{error ? t.invalidTitle : t.checking}</h1>
          {error ? <>
            <p className="auth-error verification-error" role="alert">{error === "network_error" ? a.network : a.errors[error] || a.errors.server_error}</p>
            {canRetry && <button className="button button-primary auth-submit" onClick={() => {
              request.current = null; setError(""); setAttempt(attempt + 1);
            }}>{a.retry}</button>}
            <Link className="verification-change" href="/signup">{t.restart}</Link>
          </> : <p className="auth-state" role="status">{t.checking}</p>}
        </div>
        <Link className="auth-home-link" href="/">← {a.home}</Link>
      </main>
    </>
  );
}
