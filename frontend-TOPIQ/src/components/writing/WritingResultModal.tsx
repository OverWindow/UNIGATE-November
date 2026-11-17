"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { X } from "lucide-react";
import { useApp } from "@/app/providers";
import type { Evaluation } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import { writingContent } from "@/lib/writing-content";
import { correctionSegments } from "@/lib/writing-result";
import WritingMaterial from "./WritingMaterial";
import WritingResult from "./WritingResult";

const tabs = ["question", "answer", "evaluation"] as const;
type Tab = typeof tabs[number];

export default function WritingResultModal({ entry, setNumber, error, onRetry, onClose, returnFocusRef }: {
  entry: Evaluation | null; setNumber?: number; error?: string; onRetry?: () => void; onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
}) {
  const { language } = useApp();
  const t = evaluationContent[language];
  const w = writingContent[language];
  const prefix = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);
  const [tab, setTab] = useState<Tab>("evaluation");
  const [activeCorrection, setActiveCorrection] = useState<number | null>(null);
  const question = entry?.question;
  const corrections = entry?.result?.corrections ?? [];
  const tabLabels = { question: w.question, answer: t.answer, evaluation: t.result };

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const previousFocus = document.activeElement;
    const previousOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    element.showModal();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    title.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
      const target = returnFocusRef?.current ?? previousFocus;
      if (target instanceof HTMLElement && target.isConnected) target.focus({ preventScroll: true });
    };
  }, [returnFocusRef]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  function selectCorrection(index: number) {
    setTab("evaluation");
    setActiveCorrection(index);
    // Wait until the mobile evaluation panel is visible before moving focus.
    requestAnimationFrame(() => {
      const target = document.getElementById(`${prefix}-correction-${index}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: "center", behavior: "instant" });
    });
  }

  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, current: Tab) {
    const index = tabs.indexOf(current);
    const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length]
      : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs[2] : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    document.getElementById(`${prefix}-tab-${next}`)?.focus();
  }

  function containTabFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== "Tab") return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, a[href], summary, [tabindex]"))
      .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (!first || !last || !active) return;
    const beforeFirst = first.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_PRECEDING;
    const afterLast = last.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING;
    if (event.shiftKey && (active === first || beforeFirst)) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (active === last || afterLast)) {
      event.preventDefault(); first.focus();
    }
  }

  function panelProps(name: Tab) {
    return {
      id: `${prefix}-panel-${name}`,
      role: compact ? "tabpanel" : "region",
      "aria-labelledby": `${prefix}-${compact ? "tab" : "heading"}-${name}`,
      hidden: compact && tab !== name,
    };
  }

  return <dialog ref={dialog} className="writing-result-modal" aria-labelledby={`${prefix}-title`}
    onCancel={event => { event.preventDefault(); onClose(); }} onKeyDown={containTabFocus}>
    <header className="writing-result-modal-header">
      <div><h2 ref={title} id={`${prefix}-title`} tabIndex={-1}>{t.result}</h2>
        {entry && <p>{setNumber !== undefined && <>{w.set} {setNumber} · </>}{w.question} {entry.typeSlot}
          <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(language)}</time></p>}
      </div>
      <button type="button" className="writing-result-close" onClick={onClose} aria-label={t.close}><X size={22} aria-hidden="true" /></button>
    </header>
    {error ? <div className="writing-result-modal-state" role="alert"><p>{error}</p>
      {onRetry && <button type="button" className="button writing-secondary" onClick={onRetry}>{t.check}</button>}
    </div> : !entry ? <div className="writing-result-modal-state" role="status"><span className="writing-spinner" aria-hidden="true" />{t.loading}</div> : <>
      <div className="writing-result-tabs" role="tablist" aria-label={t.result}>
        {tabs.map(name => <button type="button" key={name} id={`${prefix}-tab-${name}`} role="tab"
          aria-selected={tab === name} aria-controls={`${prefix}-panel-${name}`} tabIndex={tab === name ? 0 : -1}
          onClick={() => setTab(name)} onKeyDown={event => navigateTabs(event, name)}>{tabLabels[name]}</button>)}
      </div>
      <div className="writing-result-layout" data-question={entry.typeSlot}>
        <div className="writing-result-reference">
          <section {...panelProps("question")} className="writing-result-pane writing-result-question">
            <h3 className="writing-result-pane-heading" id={`${prefix}-heading-question`}>{w.question}<span>{t.savedQuestion}</span></h3>
            <div className="writing-result-scroll" tabIndex={0}>
              {question ? <div lang="ko">
                <p className="writing-instruction">{question.instruction}</p>
                {(question.context_title || question.passage) && <div className="writing-passage">
                  {question.context_title && <h4>{question.context_title}</h4>}{question.passage && <p>{question.passage}</p>}
                </div>}
                {entry.typeSlot === 53 && question.image_url
                  ? <img className="writing-material-image" src={question.image_url} alt={`${question.topic} 자료`} />
                  : question.materials.length > 0 && <div className="writing-materials">{question.materials.map((material, index) =>
                    <WritingMaterial key={index} material={material} language={language} />)}</div>}
                {question.material_notes.length > 0 && <ul className="writing-notes">{question.material_notes.map((note, index) => <li key={index}>{note}</li>)}</ul>}
                {question.data_source && <p className="writing-source"><span lang={language}>{w.source}: </span>{question.data_source}</p>}
                {question.requirements.length > 0 && <ul className="writing-requirements">{question.requirements.map((requirement, index) => <li key={index}>{requirement}</li>)}</ul>}
              </div> : <p>{t.errors.not_found}</p>}
            </div>
          </section>
          <section {...panelProps("answer")} className="writing-result-pane writing-result-answer">
            <h3 className="writing-result-pane-heading" id={`${prefix}-heading-answer`}>{t.answer}<span>{t.original}</span></h3>
            <div className="writing-result-scroll writing-correction-context" tabIndex={0}>
              {corrections.length > 0 && <p className="writing-correction-hint">{t.correctionHint}</p>}
              {entry.answer ? Object.entries(entry.answer).map(([key, value]) => <div key={key} lang="ko">
                {key !== "text" && <h4>{key === "a" ? "㉠" : "㉡"}</h4>}
                <p className="writing-original">{value ? correctionSegments(value, corrections).map((segment, index) =>
                  segment.corrections.length ? <mark className="writing-correction-mark" key={index}>{segment.text}<sup>{segment.corrections.map(number =>
                    <button type="button" key={number} onClick={() => selectCorrection(number)} lang={language}
                      aria-label={`${t.corrections} ${number + 1}`} aria-controls={`${prefix}-correction-${number}`}>{number + 1}</button>)}</sup></mark> : segment.text) : "—"}</p>
              </div>) : <p>{t.empty}</p>}
            </div>
          </section>
        </div>
        <section {...panelProps("evaluation")} className="writing-result-pane writing-result-evaluation">
          <h3 className="writing-result-pane-heading" id={`${prefix}-heading-evaluation`}>{t.result}</h3>
          <div className="writing-result-scroll" tabIndex={0}>
            <WritingResult entry={entry} correctionId={`${prefix}-correction`} activeCorrection={activeCorrection} />
          </div>
        </section>
      </div>
    </>}
  </dialog>;
}
