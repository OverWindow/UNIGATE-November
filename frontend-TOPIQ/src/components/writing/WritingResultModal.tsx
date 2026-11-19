"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { ChevronDown, X } from "lucide-react";
import { useApp } from "@/app/providers";
import type { Evaluation } from "@/lib/writing-api";
import { evaluationContent } from "@/lib/writing-evaluation-content";
import { writingContent } from "@/lib/writing-content";
import { correctionSegments, toggleCorrection, type CorrectionMatch } from "@/lib/writing-result";
import { closeWithMotion } from "@/lib/modal-motion";
import WritingMaterial from "./WritingMaterial";
import WritingResult from "./WritingResult";

const tabs = ["question", "answer", "evaluation"] as const;
type Tab = typeof tabs[number];

export default function WritingResultModal({ entry, setNumber, error, onRetry, onClose, returnFocusRef, evaluating = false }: {
  entry: Evaluation | null; setNumber?: number; error?: string; onRetry?: () => void; onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>; evaluating?: boolean;
}) {
  const { language } = useApp();
  const t = evaluationContent[language];
  const w = writingContent[language];
  const prefix = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const referenceScroll = useRef<HTMLDivElement>(null);
  const correctionFocusRequest = useRef(0);
  const [compact, setCompact] = useState(false);
  const [tab, setTab] = useState<Tab>("evaluation");
  const [activeCorrection, setActiveCorrection] = useState<number | null>(null);
  const [correctionsOpen, setCorrectionsOpen] = useState(false);
  const [questionExpanded, setQuestionExpanded] = useState<boolean | null>(null);
  const [appliedCorrections, setAppliedCorrections] = useState<Record<string, CorrectionMatch[]>>({});
  const question = entry?.question;
  const questionOpen = questionExpanded ?? (entry?.typeSlot === 51 || entry?.typeSlot === 52);
  const corrections = entry?.result?.corrections ?? [];
  const tabLabels = { question: w.question, answer: t.answer, evaluation: t.result };
  const hasEdits = Object.values(appliedCorrections).some(matches => matches.length > 0);
  const waiting = !entry || entry.status === "processing" || Boolean(error);

  function closeModal() {
    if (dialog.current?.dataset.closing) return;
    closeWithMotion(dialog.current, onClose);
  }

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

  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [waiting, error]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (compact) referenceScroll.current?.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, compact]);

  function selectCorrection(index: number) {
    const request = ++correctionFocusRequest.current;
    setTab("evaluation");
    setActiveCorrection(index);
    setCorrectionsOpen(true);
    // Finish the expansion before locating the selected correction in the scroll panel.
    requestAnimationFrame(async () => {
      const panel = document.getElementById(`${prefix}-correction-panel`);
      if (!panel) return;
      await Promise.allSettled(panel.getAnimations().map(animation => animation.finished));
      if (request !== correctionFocusRequest.current || !panel.isConnected || panel.getAttribute("aria-hidden") === "true") return;
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
      .filter(element => element.tabIndex >= 0 && !element.matches(":disabled") && !element.closest("[inert]") && element.getClientRects().length > 0);
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

  return <dialog ref={dialog} className={waiting ? "writing-result-pending" : "writing-result-modal"} aria-labelledby={`${prefix}-title`}
    onCancel={event => { event.preventDefault(); closeModal(); }} onKeyDown={containTabFocus}>
    {waiting ? <>
      <button type="button" className="writing-result-close" onClick={closeModal} aria-label={t.close}><X size={20} aria-hidden="true" /></button>
      <div className="writing-result-waiting-content" role={error ? "alert" : "status"}>
        {!error && <span className="writing-result-loader" aria-hidden="true" />}
        <h2 ref={title} id={`${prefix}-title`} tabIndex={-1}>{error ? t.result : evaluating || entry?.status === "processing" ? t.processingShort : t.loading}</h2>
        {error && <><p>{error}</p>{onRetry && <button type="button" className="button writing-secondary" onClick={onRetry}>{t.check}</button>}</>}
      </div>
    </> : entry && <>
    <header className="writing-result-modal-header">
      <div><h2 ref={title} id={`${prefix}-title`} tabIndex={-1}>{t.result}</h2>
        {entry && <p>{setNumber !== undefined && <>{w.set} {setNumber} · </>}{w.question} {entry.typeSlot}
          <time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString(language)}</time></p>}
      </div>
      <div className="writing-result-header-actions">
        {entry?.totalScore != null && <p className="writing-header-score" role="status">
          <span>{t.totalScore}</span><strong>{entry.totalScore}</strong><span>/ {entry.maxScore} {t.points}</span>
        </p>}
        <button type="button" className="writing-result-close" onClick={closeModal} aria-label={t.close}><X size={20} aria-hidden="true" /></button>
      </div>
    </header>
      <div className="writing-result-tabs" role="tablist" aria-label={t.result}>
        {tabs.map(name => <button type="button" key={name} id={`${prefix}-tab-${name}`} role="tab"
          aria-selected={tab === name} aria-controls={`${prefix}-panel-${name}`} tabIndex={tab === name ? 0 : -1}
          onClick={() => setTab(name)} onKeyDown={event => navigateTabs(event, name)}>{tabLabels[name]}</button>)}
      </div>
      <div className="writing-result-layout" data-question={entry.typeSlot}>
        <div className="writing-result-reference writing-result-pane" hidden={compact && tab === "evaluation"}>
          <div ref={referenceScroll} className="writing-result-scroll" tabIndex={0}>
          <section {...panelProps("question")} className="writing-result-question">
            <h3 className="writing-result-pane-heading" id={`${prefix}-heading-question`}>
              <button type="button" className="writing-question-toggle" aria-expanded={questionOpen} aria-controls={`${prefix}-question-body`}
                onClick={() => setQuestionExpanded(!questionOpen)}>
                <span>{w.question}</span><span>{t.savedQuestion}</span><ChevronDown size={15} aria-hidden="true" />
              </button>
            </h3>
            <div id={`${prefix}-question-body`} className="writing-reveal" data-open={questionOpen} aria-hidden={!questionOpen} inert={!questionOpen}>
            <div><div className="writing-result-section-body">
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
            </div></div>
            </div>
          </section>
          <section {...panelProps("answer")} className="writing-result-answer">
            <h3 className="writing-result-pane-heading" id={`${prefix}-heading-answer`}>{t.answer}<span>{hasEdits ? t.correctedAnswer : t.original}</span></h3>
            <div className="writing-result-section-body writing-correction-context">
              {entry.answer ? Object.entries(entry.answer).map(([key, value]) => <div key={key} lang="ko">
                {key !== "text" && <h4>{key === "a" ? "㉠" : "㉡"}</h4>}
                <p className="writing-original">{value ? correctionSegments(value, corrections, appliedCorrections[key]).map(segment =>
                  segment.corrections.length ? <span className="writing-correction-point" key={segment.start}>
                    <mark className="writing-correction-mark" data-applied={segment.corrections.some(match =>
                      appliedCorrections[key]?.some(edit => edit.index === match.index && edit.start === match.start)) || undefined}>{segment.text}</mark>
                    {segment.corrections.map(match => {
                      const applied = appliedCorrections[key]?.some(edit => edit.index === match.index && edit.start === match.start) ?? false;
                      return <span className="writing-correction-controls" key={`${match.index}-${match.start}`} lang={language}>
                        <button type="button" className="writing-correction-link" onClick={() => selectCorrection(match.index)}
                          aria-label={`${t.corrections} ${match.index + 1}`} aria-controls={`${prefix}-correction-${match.index}`}>{match.index + 1}</button>
                        <button type="button" className="writing-correction-toggle" aria-pressed={applied}
                          aria-label={`${applied ? t.undoCorrection : t.applyCorrection} ${match.index + 1}`}
                          onClick={() => setAppliedCorrections(previous => ({ ...previous, [key]: toggleCorrection(previous[key] ?? [], match) }))}>
                          {applied ? t.undoCorrection : t.applyCorrection}</button>
                      </span>;
                    })}
                  </span> : segment.text) : "—"}</p>
              </div>) : <p>{t.empty}</p>}
            </div>
          </section>
          </div>
        </div>
        <section {...panelProps("evaluation")} className="writing-result-pane writing-result-evaluation">
          <h3 className="writing-result-pane-heading" id={`${prefix}-heading-evaluation`}>{t.result}</h3>
          <div className="writing-result-scroll" tabIndex={0}>
            <WritingResult entry={entry} correctionId={`${prefix}-correction`} activeCorrection={activeCorrection}
              correctionsOpen={correctionsOpen} onToggleCorrections={() => setCorrectionsOpen(open => !open)} />
          </div>
        </section>
      </div>
    </>}
  </dialog>;
}
