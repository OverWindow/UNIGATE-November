"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useApp } from "@/app/providers";
import { AuthError, sendEmailVerification } from "@/lib/auth-api";
import { authContent } from "@/lib/auth-content";
import { emailContent } from "@/lib/email-content";

export default function EmailVerificationRequest({ next }: { next: string }) {
  const { language } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const t = emailContent[language];
  const a = authContent[language];
  const message = (code: string) => code === "network_error" ? a.network : a.errors[code] || a.errors.server_error;

  useEffect(() => {
    if (!cooldownUntil) return;
    const update = () => setRemaining(Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [cooldownUntil]);

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || remaining > 0) return;
    setError("");
    setFieldError("");
    if (!email.trim()) {
      setFieldError("required");
      const input = event.currentTarget.elements.namedItem("email");
      if (input instanceof HTMLElement) input.focus();
      return;
    }
    setPending(true);
    try {
      const retryAfter = await sendEmailVerification(email.trim(), language, next);
      setEmail(email.trim());
      setSent(true);
      setRemaining(retryAfter);
      setCooldownUntil(Date.now() + retryAfter * 1000);
    } catch (failure) {
      if (failure instanceof AuthError) {
        setError(failure.code);
        setFieldError(failure.fields.email?.[0] || "");
        if (failure.retryAfter > 0) {
          setRemaining(failure.retryAfter);
          setCooldownUntil(Date.now() + failure.retryAfter * 1000);
        }
      } else setError("server_error");
    } finally { setPending(false); }
  }

  return (
    <form className="auth-form" noValidate onSubmit={(event) => void send(event)}>
      <fieldset disabled={pending}>
        {sent ? (
          <div className="verification-sent" role="status">
            <span className="verification-symbol" aria-hidden="true">✉</span>
            <h2>{t.sentTitle}</h2><p>{t.sentDescription}</p>
            <strong className="verification-address">{email}</strong><p>{t.expiry}</p>
          </div>
        ) : (
          <div className="auth-field">
            <label htmlFor="email">{a.email}</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={254}
              value={email} onChange={(event) => setEmail(event.target.value)} placeholder={a.emailPlaceholder}
              aria-invalid={!!fieldError} aria-describedby={fieldError ? "email-error" : undefined} />
            {fieldError && <p className="field-error" id="email-error">{message(fieldError)}</p>}
          </div>
        )}
        {error && <p className="auth-error" role="alert">{fieldError ? message(fieldError) : message(error)}</p>}
        <button type="submit" className="button button-primary auth-submit auth-compact-submit" disabled={pending || remaining > 0} aria-busy={pending}>
          {pending ? a.submitting : remaining > 0 ? t.cooldown.replace("{seconds}", String(remaining)) : sent ? t.resend : t.send}
        </button>
        {sent && <button className="verification-change" type="button" onClick={() => {
          setSent(false); setError(""); setFieldError(""); setCooldownUntil(0); setRemaining(0);
        }}>{t.change}</button>}
      </fieldset>
    </form>
  );
}
