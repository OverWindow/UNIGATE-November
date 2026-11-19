"use client";

import { useCallback, useEffect, useId, useRef, useState, type RefObject } from "react";
import { BookOpen, ChevronUp, X } from "lucide-react";
import type { Language } from "@/lib/landing-content";
import type { WritingQuestion } from "@/lib/writing/writing-api";
import { writingContent } from "@/lib/writing/writing-content";
import { closeWithMotion } from "@/lib/modal-motion";
import WritingQuestionContent from "./WritingQuestionContent";

interface Props {
  question: WritingQuestion; language: Language; promptRef: RefObject<HTMLDivElement | null>;
}

export default function WritingQuestionPreview({ question, language, promptRef }: Props) {
  const [pastQuestion, setPastQuestion] = useState(false);
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const closePreview = useCallback(() => setOpen(false), []);
  const showBadge = pastQuestion && !open;
  const t = writingContent[language];

  useEffect(() => {
    const prompt = promptRef.current;
    if (!prompt) return;
    const header = document.querySelector<HTMLElement>(".site-header");
    let frame = 0;
    function updateVisibility() {
      frame = 0;
      const headerHeight = header?.getBoundingClientRect().height
        ?? (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-height")) || 80);
      const bounds = prompt!.getBoundingClientRect();
      // Measure the midpoint so long prompts work even when taller than the viewport.
      setPastQuestion(bounds.top + bounds.height / 2 <= headerHeight);
    }
    function scheduleUpdate() {
      if (!frame) frame = requestAnimationFrame(updateVisibility);
    }
    updateVisibility();
    const resize = new ResizeObserver(scheduleUpdate);
    resize.observe(prompt);
    if (header) resize.observe(header);
    window.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      window.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [promptRef]);

  return <>
    <button ref={trigger} type="button" className="writing-question-float" data-visible={showBadge}
      aria-hidden={!showBadge} inert={!showBadge} tabIndex={showBadge ? 0 : -1} aria-haspopup="dialog"
      aria-expanded={open} aria-controls={open ? panelId : undefined}
      onClick={() => setOpen(true)}>
      <BookOpen size={17} aria-hidden="true" /><span>{t.viewQuestion.replace("{number}", String(question.number))}</span>
      <ChevronUp size={17} aria-hidden="true" />
    </button>
    {open && <QuestionPanel id={panelId} question={question} language={language} promptRef={promptRef} trigger={trigger} onClose={closePreview} />}
  </>;
}

function QuestionPanel({ id, question, language, promptRef, trigger, onClose }: Props & {
  id: string; trigger: RefObject<HTMLButtonElement | null>; onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const t = writingContent[language];
  const requestClose = useCallback(() => {
    if (dialog.current?.dataset.closing) return;
    closeWithMotion(dialog.current, onClose);
  }, [onClose]);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    heading.current?.focus({ preventScroll: true });
    function handleEscape(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented || document.querySelector("dialog:modal")) return;
      event.preventDefault();
      requestClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      // Closing the preview must not steal focus from an answer being edited.
      if (document.activeElement !== document.body && !element.contains(document.activeElement)) return;
      const target = trigger.current?.dataset.visible === "true" ? trigger.current : promptRef.current?.querySelector("h2");
      if (target?.isConnected) target.focus({ preventScroll: true });
    };
  }, [requestClose, promptRef, trigger]);

  return <dialog ref={dialog} id={id} open className="writing-question-modal" aria-modal="false" aria-labelledby={titleId}>
    <header className="writing-question-modal-header">
      <h2 ref={heading} id={titleId} tabIndex={-1}>{t.question} {question.number}</h2>
      <button type="button" className="writing-result-close" aria-label={t.close} onClick={requestClose}><X size={18} aria-hidden="true" /></button>
    </header>
    <div className="writing-question-modal-body" tabIndex={0} role="region" aria-labelledby={titleId}>
      <WritingQuestionContent question={question} language={language} />
    </div>
  </dialog>;
}
