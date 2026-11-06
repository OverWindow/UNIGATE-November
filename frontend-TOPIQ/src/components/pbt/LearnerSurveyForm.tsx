"use client";

import { useMemo } from "react";
import { catalog, choiceLabel, currentSurveyYear, surveyCopy, type SurveyInput } from "@/lib/exam-survey";
import type { Language } from "@/lib/landing-content";

export default function LearnerSurveyForm({ value, onChange, language, errors }: {
  value: SurveyInput; onChange: (value: SurveyInput) => void; language: Language; errors: string[];
}) {
  const t = surveyCopy[language];
  const countries = useMemo(() => {
    const names = new Intl.DisplayNames([language], { type: "region" });
    return catalog.countries.map(code => ({ code, label: names.of(code) || code }))
      .sort((a, b) => a.label.localeCompare(b.label, language)).concat({ code: "OTHER", label: t.other });
  }, [language, t.other]);
  const year = currentSurveyYear();
  const levelLabel = (n: number) => n === 0 ? t.noLevel : language === "ko" ? `${n}${t.level}` : `${t.level} ${n}`;
  const error = (name: string) => errors.includes(name) ? <p id={`${name}-error`} className="exam-field-error">{t.fieldError}</p> : null;
  const select = (name: "nationalityCode" | "birthYear" | "currentTopikLevel" | "targetTopikLevel", options: {code: string; label: string}[]) => {
    const selected = value[name];
    return <div className="exam-survey-field">
      <label htmlFor={name}>{t[name]} <small>({t.required})</small></label>
      <select id={name} name={name} required value={selected === null || (selected === 0 && name !== "currentTopikLevel") ? "" : selected}
        aria-invalid={errors.includes(name)} aria-describedby={errors.includes(name) ? `${name}-error` : undefined}
        onChange={event => onChange({ ...value, [name]: name === "nationalityCode" ? event.target.value : Number(event.target.value) })}>
        <option value="" disabled>{t.choose}</option>{options.map(option => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>{error(name)}
    </div>;
  };
  const radios = (name: "koreanStudyDuration" | "topikExperience", options: string[][]) => <fieldset className="exam-survey-field" aria-describedby={errors.includes(name) ? `${name}-error` : undefined}>
    <legend>{t[name]} <small>({t.required})</small></legend>
    <div className="exam-survey-options">{options.map(row => <label key={row[0]}><input type="radio" name={name} required value={row[0]} checked={value[name] === row[0]} aria-invalid={errors.includes(name)}
      onChange={() => onChange({ ...value, [name]: row[0], ...(name === "topikExperience" && row[0] === "none" ? { currentTopikLevel: null } : {}) })} />{choiceLabel(row, language)}</label>)}</div>{error(name)}
  </fieldset>;
  return <div className="exam-survey-fields">
    <div className="exam-survey-grid">
      {select("nationalityCode", countries)}
      {select("birthYear", Array.from({ length: year - 1949 }, (_, i) => ({ code: String(year - i), label: String(year - i) })))}
    </div>
    <fieldset className="exam-survey-field" aria-describedby={errors.includes("topikReasons") ? "topikReasons-error" : undefined}>
      <legend>{t.topikReasons} <small>({t.required})</small></legend>
      <div className="exam-survey-options">{catalog.reasons.map(row => <label key={row[0]}><input type="checkbox" name="topikReasons" checked={value.topikReasons.includes(row[0])} aria-invalid={errors.includes("topikReasons")}
        onChange={event => {
          const reasons = event.target.checked ? [...value.topikReasons, row[0]] : value.topikReasons.filter(code => code !== row[0]);
          onChange({ ...value, topikReasons: reasons, topikReasonOther: reasons.includes("other") ? value.topikReasonOther : "" });
        }} />{choiceLabel(row, language)}</label>)}</div>{error("topikReasons")}
    </fieldset>
    {value.topikReasons.includes("other") && <div className="exam-survey-field"><label htmlFor="topikReasonOther">{t.topikReasonOther} <small>({t.required})</small></label>
      <textarea id="topikReasonOther" name="topikReasonOther" required maxLength={500} rows={3} value={value.topikReasonOther} aria-invalid={errors.includes("topikReasonOther")} aria-describedby={errors.includes("topikReasonOther") ? "topikReasonOther-error" : undefined}
        onChange={event => onChange({ ...value, topikReasonOther: event.target.value })} />{error("topikReasonOther")}</div>}
    {radios("koreanStudyDuration", catalog.studyDurations)}
    {radios("topikExperience", catalog.experiences)}
    <div className="exam-survey-grid">
      {value.topikExperience && value.topikExperience !== "none" && select("currentTopikLevel", Array.from({ length: 7 }, (_, n) => ({ code: String(n), label: levelLabel(n) })))}
      {select("targetTopikLevel", [3, 4, 5, 6].map(n => ({ code: String(n), label: levelLabel(n) })))}
    </div>
    <div className="exam-survey-consent"><label><input type="checkbox" name="privacyConsent" required checked={value.privacyConsent} aria-invalid={errors.includes("privacyConsent")} aria-describedby={errors.includes("privacyConsent") ? "privacyConsent-error" : undefined}
      onChange={event => onChange({ ...value, privacyConsent: event.target.checked })} /><span>{t.privacyConsent} <strong>({t.required})</strong></span></label>{error("privacyConsent")}</div>
  </div>;
}
