"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { closeModal, isBackdropClick, openModal } from "@/lib/landing/modal";
import { educationTypes, surveyCopy } from "@/lib/survey";

type Field = "email" | "age" | "education_type" | "desired_university";
type Status = "idle" | "submitting" | "success" | "failure" | "uncertain" | "invalid";
const fields: Field[] = ["email", "age", "education_type", "desired_university"];
const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000").replace(/\/$/, "");
export default function TransferRequest() {
  const t = surveyCopy;
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<Partial<Record<Field, boolean>>>({});
  const busy = status === "submitting";
  const firstError = fields.find(field => errors[field]);
  const requestMessage = status === "failure" ? t.failure : status === "uncertain" ? t.uncertain
    : status === "invalid" && !firstError ? t.invalid : null;

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  useEffect(() => {
    if (open && (status === "success" || status === "failure" || status === "uncertain" || status === "invalid")) {
      feedback.current?.focus({ preventScroll: true });
    }
  }, [status, open]);

  useEffect(() => {
    const controller = new AbortController();
    document.querySelectorAll<HTMLButtonElement>("[data-open-guide]").forEach(button => {
      button.addEventListener("click", () => {
        trigger.current = button;
        if (dialog.current) openModal(dialog.current);
        setOpen(true);
      }, { signal: controller.signal });
    });
    return () => controller.abort();
  }, []);

  function close() {
    if (!inFlight.current && dialog.current) void closeModal(dialog.current);
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
    return firstError === field ? <p id={`transfer-${field}-error`} className="field-error" role="alert">{t.errors[field]}</p> : null;
  }

  return (
    <dialog ref={dialog} id="guide-dialog" aria-labelledby="dialog-title" aria-describedby="dialog-copy"
      onCancel={event => { event.preventDefault(); close(); }}
      onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}
      onClick={event => { if (isBackdropClick(event.nativeEvent, event.currentTarget)) close(); }}>
      <button className="close" type="button" aria-label={t.close} disabled={busy} onClick={close}>×</button>
      <h2 className="modal-title" id="dialog-title">{status === "success" ? t.successTitle : "Mulai langkah pertamamu."}</h2>
      <div className={`modal-copy${requestMessage ? " request-error" : ""}`} id="dialog-copy"
        ref={requestMessage ? feedback : undefined} role={requestMessage ? "alert" : undefined}
        tabIndex={requestMessage ? -1 : undefined}>{requestMessage ?? t.description}</div>
      {status === "success" ? (
        <div ref={feedback} tabIndex={-1} role="status" className="form-feedback success">
          <p>{t.success}</p>
          <button type="button" className="primary" onClick={close}>{t.close}</button>
        </div>
      ) : (
        <form onSubmit={submit} noValidate aria-busy={busy}>
          <fieldset disabled={busy} onChange={event => {
            const target = event.target;
            if (target instanceof HTMLInputElement || target instanceof HTMLSelectElement) {
              const field = target.name as Field;
              if (errors[field]) setErrors(previous => ({ ...previous, [field]: false }));
            }
          }}>
            <div className="form-field">
              <label htmlFor="transfer-email">{t.email}</label>
              <input id="transfer-email" name="email" type="email" autoComplete="email" required maxLength={254} placeholder={t.emailPlaceholder} aria-invalid={Boolean(errors.email)} aria-describedby={firstError === "email" ? "transfer-email-error" : undefined} />
              {error("email")}
            </div>
            <div className="form-field">
              <label htmlFor="transfer-age">{t.age}</label>
              <input id="transfer-age" name="age" type="number" inputMode="numeric" min={0} max={120} step={1} required placeholder={t.agePlaceholder} aria-invalid={Boolean(errors.age)} aria-describedby={firstError === "age" ? "transfer-age-error" : undefined} />
              {error("age")}
            </div>
            <div className="form-field">
              <label htmlFor="transfer-education">{t.education}</label>
              <select id="transfer-education" name="education_type" required defaultValue="" aria-invalid={Boolean(errors.education_type)} aria-describedby={`transfer-education-help${firstError === "education_type" ? " transfer-education_type-error" : ""}`}>
                <option value="" disabled>{t.educationPlaceholder}</option>
                {educationTypes.map(value => <option key={value} value={value}>{t.choices[value]}</option>)}
              </select>
              <p id="transfer-education-help" className="notice">{t.educationHelp}</p>
              {error("education_type")}
            </div>
            <div className="form-field">
              <label htmlFor="transfer-university">{t.university}</label>
              <input id="transfer-university" name="desired_university" maxLength={500} placeholder={t.universityPlaceholder} aria-invalid={Boolean(errors.desired_university)} aria-describedby={firstError === "desired_university" ? "transfer-desired_university-error" : undefined} />
              {error("desired_university")}
            </div>
          </fieldset>
          <button type="submit" className="primary" disabled={busy}>{busy ? t.submitting : t.submit}</button>
        </form>
      )}
    </dialog>
  );
}
