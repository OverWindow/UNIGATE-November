import { useEffect, useId, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { Language } from "@/lib/landing-content";
import type { Evaluation } from "@/lib/writing/writing-api";
import { evaluationContent } from "@/lib/writing/writing-evaluation-content";
import { practiceDifferences, practiceTarget } from "@/lib/writing/writing-practice";

type Correction = NonNullable<Evaluation["result"]>["corrections"][number];
type Mode = "copy" | "recall";

export default function WritingCorrection({ correction, answer, typeSlot, language, onNext }: {
  correction: Correction; answer: Evaluation["answer"]; typeSlot: number; language: Language; onNext?: () => void;
}) {
  const t = evaluationContent[language];
  const p = t.practice;
  const [mode, setMode] = useState<Mode | null>(null);
  const [typed, setTyped] = useState("");
  const [complete, setComplete] = useState(false);
  const [differences, setDifferences] = useState<ReturnType<typeof practiceDifferences>>([]);
  const composing = useRef(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const completion = useRef<HTMLParagraphElement>(null);
  const instructionId = useId();
  const feedbackId = useId();
  const target = useMemo(() => practiceTarget(typeSlot, answer, correction), [typeSlot, answer, correction]);
  const recall = mode === "recall";

  useEffect(() => {
    if (complete) completion.current?.focus();
    else if (mode) input.current?.focus();
  }, [mode, complete]);

  function start(nextMode: Mode) {
    setMode(nextMode);
    setTyped("");
    setComplete(false);
    setDifferences([]);
    composing.current = false;
    trackEvent("writing_practice_start", { question_number: typeSlot, practice_mode: nextMode });
  }

  function check() {
    if (!mode || complete || composing.current || !typed.trim()) return;
    const parts = practiceDifferences(target.expected, typed);
    if (parts.some(part => part.kind !== "equal")) {
      setDifferences(parts);
      input.current?.focus();
      return;
    }
    setDifferences([]);
    setComplete(true);
    trackEvent("writing_practice_complete", { question_number: typeSlot, practice_mode: mode });
  }

  return <>
    <div className="writing-correction-comparison" data-recall={recall && !complete || undefined}>
      <div><span lang={language}>{t.before}</span><p lang="ko"><del>{mode ? target.original : correction.original}</del></p></div>
      {(!recall || complete) && <div><span lang={language}>{mode ? p.target : t.after}</span>
        <p lang="ko" id={mode ? instructionId : undefined}><ins>{mode ? target.expected : correction.suggestion}</ins></p></div>}
    </div>
    <p className="writing-correction-reason">{correction.reason}</p>
    {target.expected.trim() && <div className="writing-practice" lang={language}>
      {!mode ? <button className="writing-practice-action" type="button" onClick={() => start("copy")}>{p.start}</button>
        : complete ? <>
          <p className="writing-practice-complete" tabIndex={-1} ref={completion}>{p.complete}</p>
          <div className="writing-practice-actions">
            {!recall && <button className="writing-practice-action" type="button" onClick={() => start("recall")}>{p.recall}</button>}
            {onNext && <button className="writing-practice-action" type="button" onClick={onNext}>{p.next}</button>}
          </div>
        </> : <>
          {recall && <p className="writing-practice-hint" id={instructionId}>{p.recallHint}</p>}
          <label className="writing-practice-input">{p.input}
            <textarea ref={input} lang="ko" rows={2} value={typed} spellCheck={false} autoComplete="off"
              aria-describedby={differences.length ? `${instructionId} ${feedbackId}` : instructionId}
              aria-invalid={differences.length > 0 || undefined}
              onCompositionStart={() => { composing.current = true; setDifferences([]); }}
              onCompositionEnd={() => { composing.current = false; }}
              onChange={event => { setTyped(event.target.value); setDifferences([]); }} />
          </label>
          {differences.length > 0 && <div className="writing-practice-diff" id={feedbackId} role="status">
            <p>{p.differences} <ins>{p.missing}</ins> · <del>{p.extra}</del></p>
            <p lang="ko">{differences.map(({ kind, text }, index) => {
              if (kind === "equal") return text;
              const Mark = kind === "missing" ? "ins" : "del";
              const label = kind === "missing" ? p.missing : p.extra;
              return <Mark key={index}><span className="sr-only" lang={language}>{label} </span>
                {text.split(/([ \n])/u).map((part, i) => part === " " || part === "\n"
                  ? <span key={i} role="img" aria-label={part === " " ? p.space : p.newline} lang={language}>{part === " " ? "␣" : "↵"}</span>
                  : part)}</Mark>;
            })}</p>
          </div>}
          <button className="writing-practice-action" data-primary type="button" disabled={!typed.trim()} onClick={check}>{p.check}</button>
        </>}
    </div>}
  </>;
}
