import { useEffect, useState, type RefObject } from "react";
import { useApp } from "@/app/providers";
import { evaluationContent } from "@/lib/writing/writing-evaluation-content";

export default function WritingEvaluationLoading({ slot, titleId, titleRef }: {
  slot: number; titleId: string; titleRef: RefObject<HTMLHeadingElement | null>;
}) {
  const { language } = useApp();
  const t = evaluationContent[language];
  const [hintIndex, setHintIndex] = useState(0);
  const kind = slot < 53 ? "blanks" : slot === 53 ? "data" : "essay";
  const hints = [...t.reviewHints[kind], t.historyHint];
  const hintCount = hints.length;

  useEffect(() => {
    const timer = window.setInterval(() => setHintIndex(index => (index + 1) % hintCount), 5_000);
    return () => window.clearInterval(timer);
  }, [hintCount]);

  return <>
    <svg className="writing-review-paper" viewBox="0 0 152 108" aria-hidden="true" focusable="false">
      <rect x="7" y="14" width="130" height="84" rx="7" fill="#e1e8f4" />
      <rect x="8" y="10" width="130" height="84" rx="7" fill="#fffdf8" stroke="#c4cfdf" />
      <g fill="none" stroke="#d1dbe8">
        <path d="M19 28h108v22H19z M19 56h108v22H19z" />
        <path d="M37 28v22m0 6v22 M55 28v22m0 6v22 M73 28v22m0 6v22 M91 28v22m0 6v22 M109 28v22m0 6v22" />
      </g>
      <g fill="#677990" fontFamily="TOPIQ Manuscript, sans-serif" fontSize="13" textAnchor="middle">
        <text x="28 46 82 100" y="44">나의생각</text>
        <text x="28 64 82" y="72">그이유</text>
      </g>
      <g className="writing-review-ink" fill="none" stroke="#396bb7" strokeWidth="2" strokeLinecap="round">
        <path className="writing-review-first" d="M21 47h86" pathLength="1" />
        <path className="writing-review-second" d="M21 75h68" pathLength="1" />
      </g>
      <g transform="translate(21 47)">
        <g className="writing-review-pencil">
          <g transform="rotate(38)" stroke="#695342" strokeWidth="1.1" strokeLinejoin="round">
            <rect x="-4" y="-39" width="8" height="31" rx="2" fill="#efb550" />
            <path d="M-4-33h8v3h-8z" fill="#ebdec7" />
            <path d="M-4-8h8L0 0z" fill="#f1d5ad" />
            <path d="M-1.5-3h3L0 0z" fill="#37465a" stroke="none" />
          </g>
        </g>
      </g>
    </svg>
    <h2 ref={titleRef} id={titleId} tabIndex={-1}>{t.reviewing}</h2>
    <p key={hintIndex}>{hints[hintIndex]}</p>
  </>;
}
