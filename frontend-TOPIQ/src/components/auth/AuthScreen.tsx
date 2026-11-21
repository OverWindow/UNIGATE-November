"use client";

import Link from "next/link";
import { ArrowLeft, Check, Eye, EyeOff } from "lucide-react";
import { useSearchParams } from "next/navigation";
import useRouter from "@/lib/use-navigation-router";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useApp } from "@/app/providers";
import { AuthError, finishGoogleSignup, linkGoogle, safeReturnPath, type GoogleStep, type SignupInput, type VerifiedEmail } from "@/lib/auth/auth-api";
import { authContent } from "@/lib/auth/auth-content";
import { emailContent } from "@/lib/auth/email-content";
import { emptySurvey, signupSurveyCopy, surveyErrors } from "@/lib/learner-survey";
import SiteHeader from "../SiteHeader";
import EmailVerificationRequest from "./EmailVerificationRequest";
import LearnerSurveyForm from "../LearnerSurveyForm";
import AuthBackground from "./AuthBackground";
import GoogleButton from "./GoogleButton";
import styles from "./AuthBackground.module.css";

export default function AuthScreen({ mode, verification, returnPath }: {
  mode: "login" | "signup"; verification?: VerifiedEmail; returnPath?: string;
}) {
  const { language, status, refreshSession, login, signup } = useApp();
  const router = useRouter();
  const search = useSearchParams();
  const next = safeReturnPath(returnPath || search.get("next"));
  const [pending, setPending] = useState(false);
  const [google, setGoogle] = useState<GoogleStep | null>(verification?.googleFlow ? {
    step: "signup", flow: verification.googleFlow, email: verification.email, expiresAt: verification.expiresAt, needsEmail: false,
  } : null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [expired, setExpired] = useState(false);
  const [signupStep, setSignupStep] = useState<"account" | "survey">("account");
  const [survey, setSurvey] = useState(() => emptySurvey("signup"));
  const submitting = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const t = authContent[language];
  const e = emailContent[language];
  const s = signupSurveyCopy[language];
  const isLink = google?.step === "link";
  const isSignup = google ? google.step === "signup" : mode === "signup";
  const isSurvey = isSignup && signupStep === "survey";
  const title = isLink ? t.googleLink : isSignup ? isSurvey ? s.title : t.signup : t.welcome;
  const expiresAt = google?.expiresAt ?? verification?.expiresAt;
  const loginHref = `/login?next=${encodeURIComponent(next)}`;
  const signupHref = `/signup?next=${encodeURIComponent(next)}`;

  const continueGoogle = useCallback((step: GoogleStep) => {
    setFields({});
    setError("");
    setShowPassword(false);
    setGoogle(step);
  }, []);

  useEffect(() => { document.title = `${isSignup ? t.signup : t.login} | TOPIQ`; }, [isSignup, t]);
  useEffect(() => { if (status === "authenticated") router.replace(next); }, [status, router, next]);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => setExpired(true), Math.max(0, expiresAt * 1000 - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);

  const message = (code: string) => code === "network_error" ? t.network : t.errors[code] || t.errors.server_error;
  const fieldMessage = (name: string) => fields[name]?.map(code => {
    if (language === "ko" && code === "required") {
      const label = { email: "이메일을", nickname: "닉네임을", password: "비밀번호를", password_confirm: "비밀번호 확인을" }[name];
      if (label) return `${label} 입력해 주세요.`;
    }
    return message(code);
  }).join(" ");

  function focusField(name: string) {
    window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const input: SignupInput = {
      email: String(values.get("email") || "").trim(),
      nickname: String(values.get("nickname") || "").trim(),
      password: String(values.get("password") || ""),
      password_confirm: String(values.get("password_confirm") || ""),
      verification_token: verification?.token || "",
      language, survey,
    };
    const errors: Record<string, string[]> = {};
    const required = isSignup ? google ? ["nickname"] : ["email", "nickname", "password", "password_confirm"] : ["email", "password"];
    for (const name of required) {
      if (!input[name as keyof SignupInput]) errors[name] = ["required"];
    }
    if (isSignup && input.password && input.password.length < 8) errors.password = ["password_too_short"];
    if (isSignup && input.password_confirm && input.password !== input.password_confirm) errors.password_confirm = ["password_mismatch"];
    setError("");
    setFields(errors);
    if (Object.keys(errors).length) {
      setSignupStep("account");
      focusField(Object.keys(errors)[0]);
      return;
    }
    if (isSignup && !isSurvey) {
      setSignupStep("survey");
      window.requestAnimationFrame(() => headingRef.current?.focus());
      return;
    }
    if (isSignup) {
      const invalid = surveyErrors(survey, "signup");
      if (invalid.length) {
        setFields(Object.fromEntries(invalid.map(name => [name, ["invalid"]])));
        setError("validation_error");
        focusField(invalid[0]);
        return;
      }
    }
    submitting.current = true;
    setPending(true);
    try {
      if (google) {
        if (isLink) await linkGoogle(google.flow, input.password);
        else await finishGoogleSignup(google.flow, input);
        await refreshSession();
      } else if (isSignup) await signup(input);
      else await login(input.email, input.password);
    } catch (failure) {
      if (failure instanceof AuthError) {
        setFields(failure.fields);
        setError(failure.code);
        if (failure.code === "already_authenticated") void refreshSession();
        const accountField = ["email", "nickname", "password", "password_confirm"].find(name => failure.fields[name]);
        if (accountField) setSignupStep("account");
        focusField(accountField || Object.keys(failure.fields)[0] || (isSurvey ? "nationalityCode" : "email"));
      } else setError("server_error");
    } finally { submitting.current = false; setPending(false); }
  }

  return (
    <>
      <SiteHeader authHref={loginHref} />
      <main className={`auth-main${!isSignup ? ` ${styles.main}` : ""}`} id="main-content" tabIndex={-1}>
        {!isSignup && <AuthBackground />}
        <div className={`auth-card${isSignup ? " auth-signup-card" : " auth-login-card"}${isSurvey ? " auth-survey-card" : ""}`}>
          <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
          {status === "anonymous" && !verification && !google && <GoogleButton onStep={continueGoogle} />}
          {isLink && <p className="auth-description">{t.googleLinkHelp}</p>}
          {google?.needsEmail && <p className="auth-description">{t.googleEmailHelp}</p>}
          {isSignup && (isSurvey || verification) && <p className="auth-description">{isSurvey ? s.description : e.finish}</p>}
          {status === "loading" || status === "authenticated" ? (
            <p className="auth-state" role="status">{t.loading}</p>
          ) : status === "error" ? (
            <div className="auth-connection-error"><p role="alert">{t.network}</p><button className="button button-primary" onClick={() => void refreshSession()}>{t.retry}</button></div>
          ) : expired ? (
            <div className="auth-connection-error"><p role="alert">{google ? t.errors.google_restart : t.errors.email_verification_expired}</p><a className="button button-primary" href={signupHref}>{e.restart}</a></div>
          ) : isSignup && !verification && (!google || google.needsEmail) ? (
            <EmailVerificationRequest key={google?.flow || "email"} next={next} googleEmail={google?.email} googleFlow={google?.flow} />
          ) : (
            <form key={google?.flow || "email"} ref={formRef} className="auth-form" noValidate onSubmit={(event) => void submit(event)}>
              <fieldset disabled={pending}>
                <div className="auth-account-fields" hidden={isSurvey}>
                <div className="auth-field">
                  <label htmlFor="email">{t.email}</label>
                  <input id="email" name="email" type="email" autoComplete={isSignup ? "email" : "username"} maxLength={254} required placeholder={t.emailPlaceholder} defaultValue={google?.email || verification?.email} readOnly={!!verification || !!google} aria-invalid={!!fields.email} aria-describedby={fields.email ? "email-error" : verification ? "verified-email" : undefined} />
                  {verification && <p className="verified-email" id="verified-email"><Check size={14} aria-hidden="true" /> {e.verified}</p>}
                  {fields.email && <p className="field-error" id="email-error">{fieldMessage("email")}</p>}
                </div>
                {isSignup && <div className="auth-field">
                  <label htmlFor="nickname">{t.nickname}</label>
                  <input id="nickname" name="nickname" autoComplete="nickname" maxLength={30} required placeholder={t.nicknamePlaceholder} aria-invalid={!!fields.nickname} aria-describedby={fields.nickname ? "nickname-error" : undefined} />
                  {fields.nickname && <p className="field-error" id="nickname-error">{fieldMessage("nickname")}</p>}
                </div>}
                {(!google || isLink) && <div className="auth-field">
                  <label htmlFor="password">{t.password}</label>
                  <div className="password-input"><input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete={isSignup ? "new-password" : "current-password"} maxLength={4096} required placeholder="••••••••" aria-invalid={!!fields.password} aria-describedby={fields.password ? "password-error" : isSignup ? "password-hint" : undefined} /><button type="button" className="password-toggle" aria-label={showPassword ? t.hide : t.show} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}</button></div>
                  {fields.password && <p className="field-error" id="password-error">{fieldMessage("password")}</p>}
                  {isSignup && <p className="field-hint" id="password-hint">{t.passwordHint}</p>}
                </div>}
                {isSignup && !google && <div className="auth-field">
                  <label htmlFor="password_confirm">{t.confirm}</label>
                  <input id="password_confirm" name="password_confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" maxLength={4096} required placeholder="••••••••" aria-invalid={!!fields.password_confirm} aria-describedby={fields.password_confirm ? "password-confirm-error" : undefined} />
                  {fields.password_confirm && <p className="field-error" id="password-confirm-error">{fieldMessage("password_confirm")}</p>}
                </div>}
                </div>
                {isSurvey && <LearnerSurveyForm value={survey} language={language} purpose="signup" errors={Object.keys(fields)} onChange={value => {
                    setSurvey(value);
                    const invalid = surveyErrors(value, "signup");
                    setFields(current => Object.fromEntries(Object.entries(current).filter(([name]) => !(name in value) || invalid.includes(name))));
                  }} />}
                {error && <p className="auth-error" role="alert">{message(error)}</p>}
                {fields.verification_token && <div className="auth-error" role="alert"><p>{fieldMessage("verification_token")}</p><Link className="verification-change" href={signupHref}>{e.restart}</Link></div>}
                <div className="auth-form-actions">
                  {isSurvey && <button type="button" className="text-link signup-back" onClick={() => { setSignupStep("account"); setError(""); focusField("nickname"); }}><ArrowLeft size={16} aria-hidden="true" /> {s.back}</button>}
                  <button type="submit" className="button button-primary auth-submit auth-compact-submit" aria-busy={pending}>{pending ? t.submitting : isLink ? t.googleLink : isSignup ? isSurvey ? s.finish : s.next : t.login}</button>
                </div>
              </fieldset>
            </form>
          )}
          <p className="auth-switch">{google ? <a href={loginHref}>{t.login}</a> : <>
            {isSignup ? t.hasAccount : t.noAccount}<Link href={isSignup ? loginHref : signupHref}>{isSignup ? t.login : t.signup}</Link>
          </>}</p>
        </div>
        <Link className="auth-home-link" href="/"><ArrowLeft size={14} aria-hidden="true" /> {t.home}</Link>
      </main>
    </>
  );
}
