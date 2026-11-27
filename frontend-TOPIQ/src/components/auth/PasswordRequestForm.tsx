"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/app/providers";
import { trackEvent } from "@/lib/analytics";
import { AuthError, requestPassword } from "@/lib/auth/auth-api";
import { authContent } from "@/lib/auth/auth-content";
import { emailContent } from "@/lib/auth/email-content";
import { passwordContent } from "@/lib/auth/password-content";
import { localizedPath } from "@/lib/locale-path";

type Purpose = "reset" | "change";

export default function PasswordRequestForm({ purpose }: { purpose: Purpose }) {
  const { language, user, status, refreshSession } = useApp();
  const a = authContent[language];
  if (purpose === "change") {
    if (status === "loading") return <p role="status">{a.loading}</p>;
    if (status === "error") return <>
      <p className="auth-error" role="alert">{a.network}</p>
      <button className="text-link" onClick={() => void refreshSession()}>{a.retry}</button>
    </>;
    if (!user) {
      const next = localizedPath("/settings/password", language);
      return <Link className="button button-primary" href={`${localizedPath("/login", language)}?next=${encodeURIComponent(next)}`}>{a.login}</Link>;
    }
    if (user.hasUsablePassword === false) return <p>{passwordContent[language].googleOnly}</p>;
  }
  return <RequestFields key={purpose === "change" ? user?.id : "reset"} purpose={purpose} email={purpose === "change" ? user?.email : undefined} />;
}

function RequestFields({ purpose, email }: { purpose: Purpose; email?: string }) {
  const { language, refreshSession } = useApp();
  const a = authContent[language];
  const p = passwordContent[language];
  const e = emailContent[language];
  const change = purpose === "change";
  const field = change ? "current_password" : "email";
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [retryAt, setRetryAt] = useState(0);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!retryAt) return;
    const timer = window.setInterval(() => {
      const seconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (!seconds) window.clearInterval(timer);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);

  function waitToResend(seconds: number) {
    setRemaining(seconds);
    setRetryAt(Date.now() + seconds * 1000);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const entry = input.current;
    if (!entry || busy.current || remaining > 0) return;
    setError("");
    setFieldError("");
    if (!entry.validity.valid) {
      setFieldError(entry.validity.valueMissing ? "required" : "invalid");
      entry.focus();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const seconds = await requestPassword(change
        ? { purpose: "change", current_password: entry.value, language }
        : { purpose: "reset", email: entry.value.trim(), language });
      trackEvent("password_request_accepted", { purpose });
      if (change) entry.value = "";
      setSent(true);
      waitToResend(seconds);
    } catch (failure) {
      const problem = failure instanceof AuthError ? failure : new AuthError("server_error");
      if (change && problem.code === "authentication_required") {
        void refreshSession();
      } else {
        const invalid = problem.fields[field]?.[0] || (change && problem.code === "invalid_credentials" ? problem.code : "");
        if (invalid) {
          setFieldError(invalid);
          requestAnimationFrame(() => entry.focus());
        } else {
          setError(problem.code);
        }
        if (problem.retryAfter > 0) waitToResend(problem.retryAfter);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return <>
    <p className="auth-description">{change ? p.changeHelp : p.resetHelp}{change && <strong className="verification-address">{email}</strong>}</p>
    <form className="auth-form" noValidate onSubmit={submit}>
      <fieldset disabled={pending}>
        {sent && <div className="verification-sent" role="status">
          <h2>{e.sentTitle}</h2>
          <p>{change ? p.changeSent : p.resetSent}</p>
          {change && <p>{p.resendPassword}</p>}
        </div>}
        <div className="auth-field">
          <label htmlFor={field}>{change ? p.current : a.email}</label>
          <input ref={input} name={field} id={field} type={change ? "password" : "email"}
            autoComplete={change ? "current-password" : "email"} maxLength={change ? 4096 : 254} required
            placeholder={change ? undefined : a.emailPlaceholder} aria-invalid={!!fieldError}
            aria-describedby={fieldError ? "request-field-error" : change ? undefined : "google-reset-hint"}
            onChange={() => { setFieldError(""); setError(""); if (!change) setSent(false); }} />
          {fieldError && <p id="request-field-error" className="field-error" role="alert">
            {fieldError === "invalid_credentials" ? p.wrongPassword : a.errors[fieldError] || a.errors.invalid}
          </p>}
          {!change && <p id="google-reset-hint" className="field-hint">{p.googleResetHint}</p>}
        </div>
        {error && <p className="auth-error" role="alert">{error === "password_unavailable" ? p.unavailable : error === "network_error" ? a.network : a.errors[error] || a.errors.server_error}</p>}
        <button type="submit" className="button button-primary auth-submit" disabled={pending || remaining > 0} aria-busy={pending}>
          {pending ? a.submitting : remaining > 0 ? e.cooldown.replace("{seconds}", String(remaining)) : sent ? e.resend : e.send}
        </button>
      </fieldset>
    </form>
  </>;
}
