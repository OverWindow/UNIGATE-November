"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "@/app/providers";
import { AuthError, safeReturnPath, type SignupInput, type VerifiedEmail } from "@/lib/auth-api";
import { authContent } from "@/lib/auth-content";
import { emailContent } from "@/lib/email-content";
import SiteHeader from "./SiteHeader";
import EmailVerificationRequest from "./EmailVerificationRequest";

export default function AuthScreen({ mode, verification, returnPath }: {
  mode: "login" | "signup"; verification?: VerifiedEmail; returnPath?: string;
}) {
  const { language, status, refreshSession, login, signup } = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeReturnPath(returnPath || search.get("next"));
  const [pending, setPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [expired, setExpired] = useState(false);
  const t = authContent[language];
  const e = emailContent[language];
  const isSignup = mode === "signup";
  const title = isSignup ? t.signupTitle : t.loginTitle;
  const loginHref = `/login?next=${encodeURIComponent(next)}`;
  const signupHref = `/signup?next=${encodeURIComponent(next)}`;

  useEffect(() => { document.title = `${isSignup ? t.signup : t.login} | TOPIQ`; }, [isSignup, t]);
  useEffect(() => { if (status === "authenticated") router.replace(next); }, [status, router, next]);
  useEffect(() => {
    if (!verification) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, verification.expiresAt * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [verification]);

  const message = (code: string) => code === "network_error" ? t.network : t.errors[code] || t.errors.server_error;
  const fieldMessage = (name: string) => fields[name]?.map(message).join(" ");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const input: SignupInput = {
      email: String(values.get("email") || "").trim(),
      nickname: String(values.get("nickname") || "").trim(),
      password: String(values.get("password") || ""),
      password_confirm: String(values.get("password_confirm") || ""),
      verification_token: verification?.token || "",
    };
    const errors: Record<string, string[]> = {};
    for (const name of isSignup ? ["email", "nickname", "password", "password_confirm"] : ["email", "password"]) {
      if (!input[name as keyof SignupInput]) errors[name] = ["required"];
    }
    if (isSignup && input.password && input.password.length < 8) errors.password = ["password_too_short"];
    if (isSignup && input.password_confirm && input.password !== input.password_confirm) errors.password_confirm = ["password_mismatch"];
    setError("");
    setFields(errors);
    if (Object.keys(errors).length) {
      const first = form.elements.namedItem(Object.keys(errors)[0]);
      if (first instanceof HTMLElement) first.focus();
      return;
    }
    setPending(true);
    try {
      if (isSignup) await signup(input);
      else await login(input.email, input.password);
    } catch (failure) {
      if (failure instanceof AuthError) {
        setFields(failure.fields);
        setError(failure.code);
        if (failure.code === "already_authenticated") void refreshSession();
        const first = form.elements.namedItem(Object.keys(failure.fields)[0] || "email");
        if (first instanceof HTMLElement) first.focus();
      } else setError("server_error");
    } finally { setPending(false); }
  }

  return (
    <>
      <SiteHeader authHref={loginHref} />
      <main className="auth-main" id="main-content" tabIndex={-1}>
        <div className="auth-card">
          <p className="eyebrow">TOPIQ / {isSignup ? t.signup : t.login}</p>
          <h1>{title}</h1>
          <p className="auth-description">{isSignup ? verification ? e.finish : e.start : t.loginDescription}</p>
          {isSignup && <p className="verification-steps">{e.steps}</p>}
          {status === "loading" || status === "authenticated" ? (
            <p className="auth-state" role="status">{t.loading}</p>
          ) : status === "error" ? (
            <div className="auth-connection-error"><p role="alert">{t.network}</p><button className="button button-primary" onClick={() => void refreshSession()}>{t.retry}</button></div>
          ) : isSignup && !verification ? <EmailVerificationRequest next={next} /> : isSignup && expired ? (
            <div className="auth-connection-error"><p role="alert">{t.errors.email_verification_expired}</p><Link className="button button-primary" href={signupHref}>{e.restart}</Link></div>
          ) : (
            <form className="auth-form" noValidate onSubmit={(event) => void submit(event)}>
              <fieldset disabled={pending}>
                <div className="auth-field">
                  <label htmlFor="email">{t.email}</label>
                  <input id="email" name="email" type="email" autoComplete={isSignup ? "email" : "username"} maxLength={254} required placeholder={t.emailPlaceholder} defaultValue={verification?.email} readOnly={!!verification} aria-invalid={!!fields.email} aria-describedby={fields.email ? "email-error" : verification ? "verified-email" : undefined} />
                  {verification && <p className="verified-email" id="verified-email">✓ {e.verified}</p>}
                  {fields.email && <p className="field-error" id="email-error">{fieldMessage("email")}</p>}
                </div>
                {isSignup && <div className="auth-field">
                  <label htmlFor="nickname">{t.nickname}</label>
                  <input id="nickname" name="nickname" autoComplete="nickname" maxLength={30} required placeholder={t.nicknamePlaceholder} aria-invalid={!!fields.nickname} aria-describedby={fields.nickname ? "nickname-error" : undefined} />
                  {fields.nickname && <p className="field-error" id="nickname-error">{fieldMessage("nickname")}</p>}
                </div>}
                <div className="auth-field">
                  <label htmlFor="password">{t.password}</label>
                  <div className="password-input"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} maxLength={4096} required aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : isSignup ? "password-hint" : undefined} /><button type="button" className="password-toggle" aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? t.hide : t.show}</button></div>
                  {fields.password && <p className="field-error" id="password-error">{fieldMessage("password")}</p>}
                  {isSignup && <p className="field-hint" id="password-hint">{t.passwordHint}</p>}
                </div>
                {isSignup && <div className="auth-field">
                  <label htmlFor="password_confirm">{t.confirm}</label>
                  <input id="password_confirm" name="password_confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={4096} required aria-invalid={!!fields.password_confirm} aria-describedby={fields.password_confirm ? "password-confirm-error" : undefined} />
                  {fields.password_confirm && <p className="field-error" id="password-confirm-error">{fieldMessage("password_confirm")}</p>}
                </div>}
                {error && <p className="auth-error" role="alert">{message(error)}</p>}
                {fields.verification_token && <div className="auth-error" role="alert"><p>{fieldMessage("verification_token")}</p><Link className="verification-change" href={signupHref}>{e.restart}</Link></div>}
                <button type="submit" className="button button-primary auth-submit" aria-busy={pending}>{pending ? t.submitting : isSignup ? t.signup : t.login}<span aria-hidden="true">→</span></button>
              </fieldset>
            </form>
          )}
          <p className="auth-switch">{isSignup ? t.hasAccount : t.noAccount}<Link href={isSignup ? loginHref : signupHref}>{isSignup ? t.login : t.signup}</Link></p>
          {isSignup && <p className="auth-note">{t.signupNote}</p>}
        </div>
        <Link className="auth-home-link" href="/">← {t.home}</Link>
      </main>
    </>
  );
}
