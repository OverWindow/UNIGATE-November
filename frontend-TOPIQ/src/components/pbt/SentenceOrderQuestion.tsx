"use client";

import { useRef, useState, type DragEvent } from "react";
import { useApp } from "@/app/providers";
import { answerText, isAnswered, type Question } from "@/lib/pbt-api";
import { pbtContent } from "@/lib/pbt-content";
import { moveSentence, sentenceOrderCopy } from "@/lib/sentence-order";

export default function SentenceOrderQuestion({ question, disabled, review, onChange }: {
  question: Question; disabled?: boolean; review?: boolean; onChange?: (order: (string | null)[]) => void;
}) {
  const { language } = useApp();
  const t = sentenceOrderCopy[language];
  const common = pbtContent[language];
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | "bank" | null>(null);
  const dragId = useRef<string | null>(null);
  const slots = useRef<(HTMLButtonElement | null)[]>([]);
  const bankButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const sentences = question.sentences ?? [];
  const order = question.selectedOrder ?? [null, null, null, null];
  const available = sentences.filter(sentence => !order.includes(sentence.id));
  const textFor = (id: string) => sentences.find(sentence => sentence.id === id)?.text ?? "";
  const hintId = `sentence-order-hint-${question.position}`;

  function move(id: string, target: number | null) {
    if (disabled || review) return;
    setSelected(null);
    const next = moveSentence(order, id, target);
    if (next.some((value, index) => value !== order[index])) onChange?.(next);
    requestAnimationFrame(() => (target === null ? bankButtons.current[id] : slots.current[target])?.focus());
  }

  function startDrag(event: DragEvent, id: string) {
    if (disabled || review) { event.preventDefault(); return; }
    dragId.current = id;
    setDragging(id); setSelected(null);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
  }

  function endDrag() {
    dragId.current = null;
    setDragging(null); setOver(null);
  }

  function dragOver(event: DragEvent, target: number | "bank") {
    if (!dragId.current || disabled || review) return;
    event.preventDefault(); event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    setOver(target);
  }

  function drop(event: DragEvent, target: number | null) {
    event.preventDefault(); event.stopPropagation();
    if (dragId.current) move(dragId.current, target);
    endDrag();
  }

  function selectSlot(index: number) {
    if (disabled) return;
    if (selected && selected !== order[index]) move(selected, index);
    else setSelected(selected === order[index] ? null : order[index]);
  }

  const reviewOrder = (values: (string | null)[], correct: boolean) => <ol className={`sentence-order-slots${correct ? " is-correct" : ""}`}>
    {values.map((id, index) => <li key={index} className={`sentence-order-card${!correct && id && !question.isCorrect ? " is-wrong" : ""}`}>
      <span className="sentence-order-number">{index + 1}</span>
      <span>{id ? <><strong>({id})</strong> {textFor(id)}</> : common.noAnswer}</span>
    </li>)}
  </ol>;

  return <div className="sentence-order" onKeyDown={event => {
    if (event.key === "Escape") { setSelected(null); endDrag(); }
  }}>
    {!review && <p className="sentence-order-hint" id={hintId}>{t.hint}</p>}
    <div className="sentence-order-layout">
      <section className="sentence-order-answer" aria-label={t.answer}>
        <h3>{review ? common.yourAnswer : t.answer}</h3>
        {review ? <>{!isAnswered(question) && <p className="pbt-muted">{t.partial}</p>}{reviewOrder(order, false)}</> : <ol className="sentence-order-slots">
          {order.map((id, index) => <li key={index}>
            <button ref={node => { slots.current[index] = node; }} type="button"
              className={`sentence-order-card${id ? "" : " is-empty"}${selected && selected === id ? " is-selected" : ""}${dragging === id && id ? " is-dragging" : ""}${over === index ? " is-over" : ""}`}
              aria-disabled={disabled} aria-pressed={!!id && selected === id} aria-describedby={hintId}
              draggable={!!id && !disabled} onDragStart={event => { if (id) startDrag(event, id); }} onDragEnd={endDrag}
              onDragOver={event => dragOver(event, index)} onDragLeave={() => setOver(null)} onDrop={event => drop(event, index)}
              onClick={() => selectSlot(index)}>
              <span className="sentence-order-number">{index + 1}</span>
              <span>{id ? <><strong>({id})</strong> {textFor(id)}</> : t.empty}</span>
            </button>
          </li>)}
        </ol>}
      </section>
      {review ? <section aria-label={common.correct}><h3>{common.correct}</h3>{reviewOrder(question.correctOrder ?? [], true)}</section>
        : <section className={`sentence-order-bank${over === "bank" ? " is-over" : ""}`} aria-label={t.bank}
          onDragOver={event => dragOver(event, "bank")} onDragLeave={() => setOver(null)} onDrop={event => drop(event, null)}>
          <h3>{t.bank}</h3>
          <div className="sentence-order-cards">{available.map(sentence => <button key={sentence.id}
            ref={node => { bankButtons.current[sentence.id] = node; }} type="button"
            className={`sentence-order-card${selected === sentence.id ? " is-selected" : ""}${dragging === sentence.id ? " is-dragging" : ""}`}
            aria-disabled={disabled} aria-pressed={selected === sentence.id} aria-describedby={hintId}
            draggable={!disabled} onDragStart={event => startDrag(event, sentence.id)} onDragEnd={endDrag}
            onClick={() => { if (!disabled) setSelected(selected === sentence.id ? null : sentence.id); }}>
            <strong>({sentence.id})</strong><span>{sentence.text}</span>
          </button>)}</div>
          {!available.length && <p className="sentence-order-bank-empty">{t.allPlaced}</p>}
          <button type="button" className="sentence-order-return" aria-disabled={disabled || !selected || !order.includes(selected)}
            onClick={() => { if (selected && order.includes(selected)) move(selected, null); }}>{t.returnSentence}</button>
        </section>}
    </div>
    {!review && <p className="sentence-order-status" role="status">{selected ? `${t.selected}: (${selected})` : `${t.answer}: ${answerText(question)}`}</p>}
  </div>;
}
