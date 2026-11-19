"use client";

import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { layoutManuscript, manuscriptColumns, manuscriptOffsetAt, manuscriptPosition } from "@/lib/writing/writing-manuscript";

interface Props {
  id: string; value: string; onChange: (value: string) => void; manuscript: boolean;
  minimumCells: number; maxLength: number; disabled: boolean; label: string; describedBy: string;
  onComposingChange: (composing: boolean) => void;
}

export default function ManuscriptEditor({ id, value, onChange, manuscript, minimumCells, maxLength, disabled, label, describedBy, onComposingChange }: Props) {
  const input = useRef<HTMLTextAreaElement>(null);
  const paper = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const caret = useRef<HTMLSpanElement>(null);
  const composing = useRef(false);
  const dragAnchor = useRef<number | null>(null);
  const preferredColumn = useRef<number | null>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0, direction: "none" });
  const [focused, setFocused] = useState(false);
  const [compositionPosition, setCompositionPosition] = useState<number | null>(null);
  const layout = useMemo(() => layoutManuscript(value, minimumCells), [value, minimumCells]);
  const activeOffset = selection.direction === "backward" ? selection.start : selection.end;
  const position = manuscriptPosition(layout, activeOffset);
  const row = Math.floor(position / manuscriptColumns);
  const column = position % manuscriptColumns;
  const inputPosition = compositionPosition ?? position;

  function syncSelection() {
    const element = input.current;
    if (element) setSelection({ start: element.selectionStart, end: element.selectionEnd, direction: element.selectionDirection });
  }

  function select(anchor: number, target: number) {
    const element = input.current;
    if (!element || composing.current) return;
    element.focus({ preventScroll: true });
    element.setSelectionRange(Math.min(anchor, target), Math.max(anchor, target), target < anchor ? "backward" : "forward");
    syncSelection();
  }

  useLayoutEffect(() => {
    const scroll = viewport.current;
    if (!manuscript || !focused || !scroll) return;
    function revealCaret() {
      if (!caret.current || !scroll) return;
      const cursor = caret.current.getBoundingClientRect();
      const bounds = scroll.getBoundingClientRect();
      const bottom = bounds.top + scroll.clientHeight;
      const right = bounds.left + scroll.clientWidth;
      if (cursor.top < bounds.top + 8) scroll.scrollTop -= bounds.top + 8 - cursor.top;
      else if (cursor.bottom > bottom - 8) scroll.scrollTop += cursor.bottom - bottom + 8;
      if (cursor.left < bounds.left + 8) scroll.scrollLeft -= bounds.left + 8 - cursor.left;
      else if (cursor.right > right - 8) scroll.scrollLeft += cursor.right - right + 8;
    }
    revealCaret();
    const observer = new ResizeObserver(revealCaret);
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [manuscript, focused, position]);

  function pointOffset(event: PointerEvent<HTMLDivElement>) {
    const bounds = paper.current!.getBoundingClientRect();
    const cellWidth = bounds.width / manuscriptColumns;
    const cellHeight = bounds.height / layout.rows;
    return manuscriptOffsetAt(layout, Math.floor((event.clientY - bounds.top) / cellHeight), (event.clientX - bounds.left) / cellWidth);
  }

  function pointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled || composing.current || event.button !== 0) return;
    // Touch gestures retain native scrolling; a tap places the cursor on pointerup.
    if (event.pointerType === "touch") return;
    event.preventDefault();
    preferredColumn.current = null;
    const offset = pointOffset(event);
    const anchor = event.shiftKey ? (selection.direction === "backward" ? selection.end : selection.start) : offset;
    dragAnchor.current = anchor;
    event.currentTarget.setPointerCapture(event.pointerId);
    select(anchor, offset);
  }

  function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!manuscript || composing.current || event.nativeEvent.isComposing) return;
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    const edge = event.key === "Home" || event.key === "End";
    if ((!vertical && !edge) || event.altKey || event.ctrlKey || event.metaKey) {
      preferredColumn.current = null;
      return;
    }
    event.preventDefault();
    const element = event.currentTarget;
    const active = element.selectionDirection === "backward" ? element.selectionStart : element.selectionEnd;
    const at = manuscriptPosition(layout, active);
    const currentRow = Math.floor(at / manuscriptColumns);
    if (vertical) preferredColumn.current ??= at % manuscriptColumns;
    else preferredColumn.current = null;
    const target = manuscriptOffsetAt(layout, vertical ? currentRow + (event.key === "ArrowUp" ? -1 : 1) : currentRow,
      vertical ? preferredColumn.current! : event.key === "Home" ? 0 : manuscriptColumns);
    const anchor = event.shiftKey ? (element.selectionDirection === "backward" ? element.selectionEnd : element.selectionStart) : target;
    select(anchor, target);
  }

  const inputStyle = manuscript ? {
    left: `calc(min(${inputPosition % manuscriptColumns}, 24) * var(--manuscript-cell))`,
    top: `calc(${Math.floor(inputPosition / manuscriptColumns)} * var(--manuscript-line))`,
  } : undefined;

  return <div ref={viewport} className={manuscript ? "writing-manuscript-viewport" : undefined} data-disabled={disabled || undefined}>
    <div className={manuscript ? "writing-manuscript-sheet" : undefined}>
      <textarea ref={input} id={id} lang="ko" aria-label={label} aria-describedby={describedBy}
        className={manuscript ? "writing-manuscript-input" : undefined} style={inputStyle}
        value={value} rows={12} wrap={manuscript ? "off" : "soft"} maxLength={maxLength} disabled={disabled} spellCheck={manuscript ? false : undefined}
        onChange={event => { onChange(event.target.value); preferredColumn.current = null; syncSelection(); }}
        onSelect={syncSelection} onFocus={() => { setFocused(true); syncSelection(); }} onBlur={() => setFocused(false)}
        onKeyDown={keyDown}
        onCompositionStart={() => { composing.current = true; setCompositionPosition(position); onComposingChange(true); }}
        onCompositionEnd={event => {
          composing.current = false; setCompositionPosition(null); onComposingChange(false);
          onChange(event.currentTarget.value); syncSelection();
        }} />
      {manuscript && <>
        <div ref={paper} className="writing-manuscript-paper" aria-hidden="true" onPointerDown={pointerDown}
          onPointerMove={event => { if (dragAnchor.current !== null) select(dragAnchor.current, pointOffset(event)); }}
          onPointerUp={event => {
            if (event.pointerType === "touch" && !disabled && !composing.current) {
              const offset = pointOffset(event); select(offset, offset);
            }
            dragAnchor.current = null;
          }}
          onPointerCancel={() => { dragAnchor.current = null; }}
          onLostPointerCapture={() => { dragAnchor.current = null; }}>
          {layout.cells.map((cell, index) => <span className="writing-manuscript-cell" key={index}>
            {cell?.parts.map(part => <span key={part.start}
              className={part.start < selection.end && part.end > selection.start && focused ? "is-selected" : undefined}>
              {part.text}
            </span>)}
          </span>)}
          {focused && !disabled && <span ref={caret} className="writing-manuscript-caret"
            style={{ left: `calc(${column} * var(--manuscript-cell))`, top: `calc(${row} * var(--manuscript-line))`,
              visibility: selection.start === selection.end ? undefined : "hidden" }} />}
        </div>
        <div className="writing-manuscript-markers" aria-hidden="true">
          {Array.from({ length: layout.rows }, (_, index) => <span key={index}>{(index + 1) % 2 === 0 ? (index + 1) * manuscriptColumns : ""}</span>)}
        </div>
      </>}
    </div>
  </div>;
}
