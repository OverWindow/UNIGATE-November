"use client";

import { useState } from "react";
import { Star } from "lucide-react";
import type { Language } from "@/lib/landing-content";
import { surveyCopy } from "@/lib/learner-survey";

export default function StarRating({ value, onChange, language, invalid }: { value: number; onChange: (value: number) => void; language: Language; invalid: boolean }) {
  const [hover, setHover] = useState(0);
  const t = surveyCopy[language];
  return <fieldset className="exam-rating" aria-describedby={invalid ? "rating-error" : undefined}>
    <legend>{t.rating} <small>({t.required})</small></legend>
    <div className="exam-stars" onMouseLeave={() => setHover(0)}>{[1, 2, 3, 4, 5].map(n => <label key={n} onMouseEnter={() => setHover(n)}>
      <input type="radio" name="rating" value={n} required checked={value === n} aria-label={`${n} ${t.ratingUnit}`} aria-invalid={invalid} onChange={() => onChange(n)} />
      <span aria-hidden="true" className={n <= (hover || value) ? "is-filled" : ""}><Star size={42} strokeWidth={1.5} /></span>
    </label>)}</div>
    {invalid && <p className="exam-field-error" id="rating-error">{t.fieldError}</p>}
  </fieldset>;
}
