"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, FileText, X } from "lucide-react";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { educationTypes, surveyTranslations } from "@/lib/i18n/survey";

type Field = "email" | "age" | "education_type" | "desired_university";
type Status = "idle" | "submitting" | "success" | "failure" | "uncertain" | "invalid";
const fields: Field[] = ["email", "age", "education_type", "desired_university"];
const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
const inputClass = "mt-2 w-full min-w-0 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-base text-black outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15 aria-invalid:border-red-600";

export default function TransferRequest() {
  const { lang } = useLanguage();
  const t = surveyTranslations[lang];
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Partial<Record<Field, boolean>>>({});
  const busy = status === "submitting";

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    if (open && (status === "success" || status === "failure" || status === "uncertain" || status === "invalid")) {
      feedback.current?.focus();
    }
  }, [status, open]);

  function show() {
    dialog.current?.showModal();
    if (dialog.current) {
      dialog.current.scrollTop = 0;
      dialog.current.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    }
    setOpen(true);
  }

  function close() {
    if (!inFlight.current) dialog.current?.close();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const email = String(data.get("email") ?? "").trim();
    const age = String(data.get("age") ?? "").trim();
    const education = String(data.get("education_type") ?? "");
    const university = String(data.get("desired_university") ?? "").trim();
    const invalid: Partial<Record<Field, boolean>> = {};
    const emailInput = form.elements.namedItem("email") as HTMLInputElement;
    if (!email || email.length > 254 || emailInput.validity.typeMismatch) invalid.email = true;
    if (!/^\d+$/.test(age) || Number(age) > 120) invalid.age = true;
    if (!educationTypes.some((value) => value === education)) invalid.education_type = true;
    if (university.length > 500) invalid.desired_university = true;
    setErrors(invalid);
    if (Object.keys(invalid).length) {
      setStatus("invalid");
      (form.elements.namedItem(fields.find((field) => invalid[field])!) as HTMLElement).focus();
      return;
    }

    inFlight.current = true;
    setStatus("submitting");
    let sent = false;
    try {
      const tokenResponse = await fetch(`${backendUrl}/api/csrf/`, {
        credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15000),
      });
      if (!tokenResponse.ok) throw new Error("csrf_unavailable");
      const token = await tokenResponse.json();
      if (typeof token.csrfToken !== "string") throw new Error("csrf_unavailable");
      sent = true;
      const response = await fetch(`${backendUrl}/api/survey-responses/`, {
        method: "POST", credentials: "include", signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", "X-CSRFToken": token.csrfToken },
        body: JSON.stringify({ email, age: Number(age), education_type: education, desired_university: university || null }),
      });
      if (response.status === 201) {
        form.reset();
        setStatus("success");
      } else if (response.status === 400) {
        const result = await response.json();
        setErrors(Object.fromEntries(fields.filter((field) => result.fields?.[field]).map((field) => [field, true])));
        setStatus("invalid");
      } else {
        setStatus(response.status >= 500 ? "uncertain" : "failure");
      }
    } catch {
      // Never retry a POST automatically: the server may already have saved it.
      setStatus(sent ? "uncertain" : "failure");
    } finally {
      inFlight.current = false;
    }
  }

  function error(field: Field) {
    return errors[field] ? <p id={`transfer-${field}-error`} className="mt-2 text-sm text-red-700">{t.errors[field]}</p> : null;
  }

  return (
    <div className="mt-12 text-center">
      <button ref={trigger} type="button" onClick={show} className="inline-flex max-w-full items-center justify-center gap-3 rounded-xl bg-primary px-7 py-4 text-base font-semibold text-white transition hover:bg-primary-dark">
        {t.button}<ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
      </button>
      <p className="mx-auto mt-4 max-w-xl px-3 text-sm leading-relaxed text-gray-600">{t.description}</p>

      <dialog ref={dialog} aria-labelledby="transfer-title" aria-describedby="transfer-description"
        className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-left text-black shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        onCancel={(event) => { if (inFlight.current) event.preventDefault(); }}
        onClose={() => { setOpen(false); trigger.current?.focus(); }}
        onClick={(event) => { if (event.target === event.currentTarget) { const r = event.currentTarget.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) close(); } }}>
        <div className="relative p-6 sm:p-9">
          <button type="button" aria-label={t.close} disabled={busy} onClick={close} className="absolute top-4 right-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-40"><X className="h-5 w-5" aria-hidden="true" /></button>
          <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileText className="h-6 w-6" aria-hidden="true" /></div>
          <h2 id="transfer-title" className="pr-5 text-2xl font-bold leading-snug">{status === "success" ? t.successTitle : t.title}</h2>
          <p id="transfer-description" className="mt-3 text-sm leading-relaxed text-gray-600">{t.description}</p>

          {status === "success" ? (
            <div ref={feedback} tabIndex={-1} role="status" className="mt-7 rounded-2xl bg-primary/5 p-5">
              <Check className="mb-3 h-7 w-7 text-primary" aria-hidden="true" />
              <p className="text-sm leading-relaxed">{t.success}</p>
              <button type="button" onClick={close} className="mt-5 rounded-xl bg-primary px-6 py-3 font-semibold text-white">{t.close}</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate className="mt-7" aria-busy={busy}>
              <fieldset disabled={busy} className="min-w-0 space-y-5 disabled:opacity-70" onChange={(event) => {
                const target = event.target;
                if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
                  const field = target.name as Field;
                  if (errors[field]) setErrors((previous) => ({ ...previous, [field]: false }));
                }
              }}>
                <div>
                  <label htmlFor="transfer-email" className="text-sm font-semibold">{t.email}</label>
                  <input id="transfer-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder={t.emailPlaceholder} className={inputClass} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "transfer-email-error" : undefined} />
                  {error("email")}
                </div>
                <div>
                  <label htmlFor="transfer-age" className="text-sm font-semibold">{t.age}</label>
                  <input id="transfer-age" name="age" type="number" inputMode="numeric" min={0} max={120} step={1} required placeholder={t.agePlaceholder} className={inputClass} aria-invalid={Boolean(errors.age)} aria-describedby={errors.age ? "transfer-age-error" : undefined} />
                  {error("age")}
                </div>
                <div>
                  <label htmlFor="transfer-education" className="text-sm font-semibold">{t.education}</label>
                  <select id="transfer-education" name="education_type" required defaultValue="" className={inputClass} aria-invalid={Boolean(errors.education_type)} aria-describedby={`transfer-education-help${errors.education_type ? " transfer-education_type-error" : ""}`}>
                    <option value="" disabled>{t.educationPlaceholder}</option>
                    {educationTypes.map((value) => <option key={value} value={value}>{t.choices[value]}</option>)}
                  </select>
                  <p id="transfer-education-help" className="mt-2 text-xs leading-relaxed text-gray-600">{t.educationHelp}</p>
                  {error("education_type")}
                </div>
                <div>
                  <label htmlFor="transfer-university" className="text-sm font-semibold">{t.university}</label>
                  <input id="transfer-university" name="desired_university" maxLength={500} placeholder={t.universityPlaceholder} className={inputClass} aria-invalid={Boolean(errors.desired_university)} aria-describedby={errors.desired_university ? "transfer-desired_university-error" : undefined} />
                  {error("desired_university")}
                </div>
              </fieldset>
              {(status === "failure" || status === "uncertain" || status === "invalid") && <div ref={feedback} tabIndex={-1} role="alert" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{t[status]}</div>}
              <button type="submit" disabled={busy} className="mt-6 w-full rounded-xl bg-primary px-6 py-4 font-semibold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60">{busy ? t.submitting : t.submit}</button>
            </form>
          )}
        </div>
      </dialog>
    </div>
  );
}
