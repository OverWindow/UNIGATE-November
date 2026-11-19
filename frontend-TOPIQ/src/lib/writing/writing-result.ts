import type { Evaluation } from "./writing-api";
import type { Language } from "../landing-content";

// Keep these display limits aligned with backend/writing/contract.py.
export const writingScoreLimits: Record<number, Record<string, number>> = {
  51: { a: 5, b: 5 }, 52: { a: 5, b: 5 },
  53: { content: 7, organization: 7, language: 16 },
  54: { content: 12, organization: 12, language: 26 },
};

export function visibleReviewReasons(reasons: string[], language: Language = "ko"): string[] {
  if (language !== "ko") return reasons.filter(reason => reason.trim());
  return reasons.map(reason => reason.split(/(?<=[.!?。])\s+|\n+/u).filter(sentence => {
    const text = sentence.trim();
    const genericEstimate = /(?:부분\s*점수|빈칸|0\s*[~∼～–-]\s*5\s*점)/u.test(text)
      && /(?:기준|배점)/u.test(text)
      && /실험적(?:인)?\s*추정(?:입니다|이다|임)?[.!。]?$/u.test(text);
    return !genericEstimate;
  }).join(" ").trim()).filter(Boolean);
}

export interface CorrectionMatch { start: number; end: number; index: number }

export function toggleCorrection(applied: CorrectionMatch[], match: CorrectionMatch): CorrectionMatch[] {
  if (applied.some(item => item.index === match.index && item.start === match.start)) {
    return applied.filter(item => item.index !== match.index || item.start !== match.start);
  }
  // A new suggestion replaces overlapping edits; all offsets refer to the saved original.
  return [...applied.filter(item => item.end <= match.start || item.start >= match.end), match];
}

export function correctionSegments(text: string, corrections: { original: string; suggestion?: string }[], applied: CorrectionMatch[] = []) {
  const matches: CorrectionMatch[] = [];
  corrections.forEach(({ original }, index) => {
    if (!original.trim()) return;
    // Repeated quotes are separate edit points, identified by their original offsets.
    let start = text.indexOf(original);
    while (start !== -1) {
      matches.push({ start, end: start + original.length, index });
      start = text.indexOf(original, start + 1);
    }
  });
  const groups: { start: number; end: number; corrections: CorrectionMatch[] }[] = [];
  matches.sort((a, b) => a.start - b.start || a.end - b.end || a.index - b.index).forEach(match => {
    const previous = groups[groups.length - 1];
    if (previous && match.start < previous.end) {
      previous.end = Math.max(previous.end, match.end);
      previous.corrections.push(match);
    } else groups.push({ start: match.start, end: match.end, corrections: [match] });
  });
  const segments: { start: number; text: string; corrections: CorrectionMatch[] }[] = [];
  let cursor = 0;
  for (const group of groups) {
    if (cursor < group.start) segments.push({ start: cursor, text: text.slice(cursor, group.start), corrections: [] });
    let position = group.start;
    let value = "";
    const edits = applied.filter(edit => group.corrections.some(match => match.index === edit.index && match.start === edit.start))
      .sort((a, b) => a.start - b.start);
    for (const edit of edits) {
      value += text.slice(position, edit.start) + (corrections[edit.index].suggestion ?? text.slice(edit.start, edit.end));
      position = edit.end;
    }
    value += text.slice(position, group.end);
    segments.push({ start: group.start, text: value, corrections: group.corrections });
    cursor = group.end;
  }
  if (cursor < text.length) segments.push({ start: cursor, text: text.slice(cursor), corrections: [] });
  return segments;
}

export function writingTaskLabel(id: string, question: Evaluation["question"], language: Language = "ko"): string | undefined {
  if (id === "a" || id === "b") {
    const blank = id === "a" ? "㉠" : "㉡";
    return { ko: `${blank}의 문맥·의미·문법·격식`, en: `${blank}: context, meaning, grammar and register`,
      id: `${blank}: konteks, makna, tata bahasa, dan ragam bahasa` }[language];
  }
  const match = /^(requirement|material|note):([1-9]\d*)$/.exec(id);
  if (!match || !question) return undefined;
  const index = Number(match[2]) - 1;
  if (match[1] === "requirement") return question.requirements[index];
  if (match[1] === "note") return question.material_notes[index];
  const title = question.materials[index]?.title;
  return title ? `${{ ko: "자료의 정보와 관계", en: "Data and relationships", id: "Data dan hubungannya" }[language]}: ${title}` : undefined;
}
