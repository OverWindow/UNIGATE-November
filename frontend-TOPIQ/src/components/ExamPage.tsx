"use client";

import { useState } from "react";
import { ExternalLink } from "lucide-react";
import { useApp } from "@/app/providers";
import { examContent, type ExamArea, type ExamFormat } from "@/lib/exam-content";
import { landingContent } from "@/lib/landing-content";
import SiteFooter from "./SiteFooter";
import SiteHeader from "./SiteHeader";

export default function ExamPage({ format }: { format: ExamFormat }) {
  const { language } = useApp();
  const [area, setArea] = useState<ExamArea>("reading");
  const t = examContent[language];
  const landing = landingContent[language];
  const exam = t.formats[format];

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="exam-main" tabIndex={-1}>
        <section className="exam-intro" aria-labelledby="exam-heading">
          <div className="page-container">
            <p className="eyebrow">{exam.label}</p>
            <h1 id="exam-heading">TOPIK II {format.toUpperCase()}</h1>
            <p className="exam-description">{exam.description}</p>
            <a className="text-link" href="https://www.topik.go.kr/" target="_blank" rel="noopener noreferrer">
              {landing.guide.action}
              <ExternalLink size={18} strokeWidth={1.7} aria-hidden="true" />
            </a>
          </div>
        </section>
        <section className="learning-section section-space" aria-labelledby="exam-selection-title">
          <div className="page-container">
            <p className="eyebrow">{t.eyebrow}</p>
            <h2 id="exam-selection-title" className="section-heading">{t.title}</h2>
            <p className="section-description">{t.description}</p>
            <div className="learning-panel">
              <div className="learning-select">
                <label htmlFor="exam-area">{t.area}</label>
                <select id="exam-area" value={area} aria-describedby="exam-area-description" onChange={(event) => setArea(event.target.value as ExamArea)}>
                  <option value="reading">{landing.areas.reading.name}</option>
                  <option value="writing">{landing.areas.writing.name}</option>
                </select>
              </div>
              <div className="learning-select">
                <label htmlFor="exam-round">{t.round}</label>
                <select id="exam-round" disabled aria-describedby="exam-notice">
                  <option>{t.emptyRounds}</option>
                </select>
              </div>
              <button className="button button-primary" type="button" disabled aria-describedby="exam-notice">{t.action}</button>
            </div>
            <p id="exam-area-description" className="exam-focus" aria-live="polite">{landing.areas[area].summary}</p>
            <p id="exam-notice" className="development-note"><span className="status-dot" aria-hidden="true" />{t.notice}</p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
