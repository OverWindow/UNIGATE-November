"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/app/providers";
import { AuthError, confirmPassword } from "@/lib/auth/auth-api";
import { authContent } from "@/lib/auth/auth-content";
import { passwordContent } from "@/lib/auth/password-content";
import { landingContent } from "@/lib/landing-content";
import { localizedPath } from "@/lib/locale-path";
import useNavigationRouter from "@/lib/use-navigation-router";

type Result = "reset" | "change";

export default function PasswordConfirmForm() {
  const { language, refreshSession } = useApp();
  const p = passwordContent[language];
  const a = authContent[language];
  const token = useRef("");
  const initialized = useRef(false);
  const busy = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [linkError, setLinkError] = useState("");
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});

  useEffect(() => {
    function readLink() {
      const { hash, pathname, search } = window.location;
      if (!hash && initialized.current) return;
      initialized.current = true;
      token.current = new URLSearchParams(hash.slice(1)).get("token") || "";
      if (hash) window.history.replaceState(window.history.state, "", pathname + search);
      form.current?.reset();
      setLinkError(token.current ? "" : "password_link_invalid");
      setError("");
      setFields({});
      setResult(null);
      setReady(true);
    }
    readLink();
    window.addEventListener("hashchange", readLink);
    return () => window.removeEventListener("hashchange", readLink);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const proof = token.current;
    if (busy.current || !proof) return;
    const values = new FormData(event.currentTarget);
    const password = String(values.get("new_password") || "");
    const confirmation = String(values.get("new_password_confirm") || "");
    const issues: Record<string, string[]> = {};
    if (!password) issues.new_password = ["required"];
    else if ([...password].length < 8) issues.new_password = ["password_too_short"];
    if (!confirmation) issues.new_password_confirm = ["required"];
    else if (password !== confirmation) issues.new_password_confirm = ["password_mismatch"];
    setFields(issues);
    setError("");
    if (Object.keys(issues).length) {
      focusField(Object.keys(issues)[0]);
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      const purpose = await confirmPassword(proof, password, confirmation);
      void refreshSession();
      if (token.current !== proof) return;
      token.current = "";
      form.current?.reset();
      setResult(purpose);
    } catch (failure) {
      if (token.current !== proof) return;
      const problem = failure instanceof AuthError ? failure : new AuthError("server_error");
      if (["password_link_invalid", "password_link_expired", "password_session_mismatch", "authentication_required", "password_unavailable"].includes(problem.code)) {
        token.current = "";
        setLinkError(problem.code);
      } else {
        setFields(problem.fields);
        const field = Object.keys(problem.fields)[0];
        if (field) requestAnimationFrame(() => focusField(field));
        else setError(problem.code);
      }
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  function focusField(name: string) {
    const input = form.current?.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.focus();
  }

  if (result) return <>
    <h1>{p.done}</h1>
    {result === "change" ? <>
      <p className="auth-description" role="status">{p.changeDone}</p>
      <Link className="button button-primary" href={localizedPath("/settings", language)}>{landingContent[language].footer.settings}</Link>
    </> : <LoginAfterReset />}
  </>;
  const sessionError = linkError === "password_session_mismatch" || linkError === "authentication_required";
  return <>
    <h1>{p.newPassword}</h1>
    {!ready ? <p className="auth-state" role="status">{a.submitting}</p> : linkError ? <>
      <p className="auth-error verification-error" role="alert">
        {sessionError ? p.sessionMismatch : linkError === "password_link_expired" ? p.expired : linkError === "password_unavailable" ? p.unavailable : p.invalid}
      </p>
      <p className="auth-switch">
        {!sessionError && <Link href={localizedPath("/forgot-password", language)}>{p.reset}</Link>}
        <Link href={localizedPath("/settings/password", language)}>{p.change}</Link>
      </p>
    </> : <form ref={form} className="auth-form mt-6" noValidate onSubmit={submit}>
      <fieldset disabled={pending}>
        {(["new_password", "new_password_confirm"] as const).map(name => {
          const first = name === "new_password";
          const description = [first ? "password-hint" : "", fields[name] ? `${name}-error` : ""].filter(Boolean).join(" ");
          return <div key={name} className="auth-field">
            <label htmlFor={name}>{first ? p.newPassword : p.confirm}</label>
            <input id={name} name={name} type="password" autoComplete="new-password" required maxLength={4096}
              aria-invalid={!!fields[name]} aria-describedby={description || undefined} />
            {first && <p className="field-hint" id="password-hint">{a.passwordHint}</p>}
            {fields[name] && <p className="field-error" id={`${name}-error`} role="alert">
              {fields[name].map(code => a.errors[code] || a.errors.invalid).join(" ")}
            </p>}
          </div>;
        })}
        {error && <p className="auth-error" role="alert">{error === "network_error" ? a.network : a.errors[error] || a.errors.server_error}</p>}
        <button type="submit" className="button button-primary auth-submit" aria-busy={pending}>{pending ? a.submitting : p.save}</button>
      </fieldset>
    </form>}
  </>;
}

function LoginAfterReset() {
  const { language, status, refreshSession, logout } = useApp();
  const router = useNavigationRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const login = localizedPath("/login", language);
  const a = authContent[language];
  const p = passwordContent[language];

  async function switchAccount() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await logout();
      router.replace(login);
    } catch (failure) {
      setError(failure instanceof AuthError ? failure.code : "server_error");
      setBusy(false);
    }
  }

  if (status === "loading") return <p className="auth-state" role="status">{a.loading}</p>;
  if (status === "error") return <>
    <p className="auth-error" role="alert">{a.network}</p>
    <button className="text-link" onClick={() => void refreshSession()}>{a.retry}</button>
  </>;
  if (status === "authenticated") return <>
    <p className="auth-description" role="status">{p.otherSession}</p>
    {error && <p className="auth-error" role="alert">{error === "network_error" ? a.network : a.errors[error] || a.errors.server_error}</p>}
    <button className="button button-primary" disabled={busy} onClick={switchAccount}>{busy ? a.submitting : p.switchAccount}</button>
    <p className="auth-switch"><Link href={localizedPath("/", language)}>{a.home}</Link></p>
  </>;
  return <>
    <p className="auth-description" role="status">{p.resetDone}</p>
    <Link className="button button-primary" href={login}>{a.login}</Link>
  </>;
}
