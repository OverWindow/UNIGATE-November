// Keep these display limits aligned with backend/writing/contract.py.
export const writingScoreLimits: Record<number, Record<string, number>> = {
  51: { a: 5, b: 5 }, 52: { a: 5, b: 5 },
  53: { content: 7, organization: 7, language: 16 },
  54: { content: 12, organization: 12, language: 26 },
};

export function visibleReviewReasons(reasons: string[]): string[] {
  return reasons.map(reason => reason.split(/(?<=[.!?。])\s+|\n+/u).filter(sentence => {
    const text = sentence.trim();
    const genericEstimate = /(?:부분\s*점수|빈칸|0\s*[~∼～–-]\s*5\s*점)/u.test(text)
      && /(?:기준|배점)/u.test(text)
      && /실험적(?:인)?\s*추정(?:입니다|이다|임)?[.!。]?$/u.test(text);
    return !genericEstimate;
  }).join(" ").trim()).filter(Boolean);
}

export function correctionSegments(text: string, corrections: { original: string }[]) {
  const matches: { start: number; end: number; index: number }[] = [];
  corrections.forEach(({ original }, index) => {
    if (!original.trim()) return;
    // Quotes have no offsets; mark every exact occurrence without rewriting the answer.
    let start = text.indexOf(original);
    while (start !== -1) {
      matches.push({ start, end: start + original.length, index });
      start = text.indexOf(original, start + 1);
    }
  });
  const boundaries = [...new Set([0, text.length, ...matches.flatMap(match => [match.start, match.end])])].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, position) => {
    const end = boundaries[position + 1];
    return {
      text: text.slice(start, end),
      corrections: [...new Set(matches.filter(match => match.start <= start && match.end >= end).map(match => match.index))],
    };
  });
}
