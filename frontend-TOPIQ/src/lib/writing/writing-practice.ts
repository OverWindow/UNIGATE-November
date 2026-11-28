import type { LearnerAnswer } from "./writing-api";

export function practiceTarget(typeSlot: number, answer: LearnerAnswer | undefined, correction: { original: string; suggestion: string }) {
  const { original, suggestion } = correction;
  const expression = { original, expected: suggestion };
  const text = answer?.text;
  if ((typeSlot !== 53 && typeSlot !== 54) || !text || !original.trim()) return expression;

  const start = text.indexOf(original);
  if (start < 0 || text.indexOf(original, start + 1) !== -1) return expression;
  if (typeof Intl.Segmenter !== "function") return expression;
  const sentences = new Intl.Segmenter("ko", { granularity: "sentence" }).segment(text);
  const sentence = sentences.containing(start);
  if (!sentence) return expression;
  const offset = start - sentence.index;
  const end = offset + original.length;
  if (end > sentence.segment.length) return expression;

  let trailing = sentence.segment.slice(end);
  // A suggestion may already supply the punctuation that follows the quoted expression.
  if (/[.!?。！？]$/u.test(suggestion) && /^[.!?。！？]/u.test(trailing)) {
    if (!suggestion.endsWith(trailing[0])) return expression;
    trailing = trailing.slice(1);
  }
  return {
    original: sentence.segment.trim(),
    expected: (sentence.segment.slice(0, offset) + suggestion + trailing).trim(),
  };
}

type Difference = { kind: "equal" | "missing" | "extra"; text: string };

function normalize(value: string) {
  return value.normalize("NFC").replace(/\r\n?/g, "\n").trim();
}

export function practiceDifferences(expected: string, typed: string): Difference[] {
  const target = Array.from(normalize(expected));
  const input = Array.from(normalize(typed));
  const differences: Difference[] = [];
  function append(kind: Difference["kind"], text: string) {
    if (!text) return;
    const last = differences.at(-1);
    if (last?.kind === kind) last.text += text;
    else differences.push({ kind, text });
  }

  let start = 0;
  let targetEnd = target.length;
  let inputEnd = input.length;
  while (start < targetEnd && start < inputEnd && target[start] === input[start]) start++;
  while (targetEnd > start && inputEnd > start && target[targetEnd - 1] === input[inputEnd - 1]) {
    targetEnd--;
    inputEnd--;
  }
  append("equal", target.slice(0, start).join(""));

  const rows = targetEnd - start + 1;
  const columns = inputEnd - start + 1;
  let i = start;
  let j = start;
  // Keep pasted or unusually long text from allocating an unbounded alignment table.
  if (rows > 1 && columns > 1 && rows * columns <= 2_000_000) {
    const lengths = new Uint16Array(rows * columns);
    for (let row = rows - 2; row >= 0; row--) {
      for (let column = columns - 2; column >= 0; column--) {
        const cell = row * columns + column;
        lengths[cell] = target[start + row] === input[start + column]
          ? 1 + lengths[cell + columns + 1]
          : Math.max(lengths[cell + columns], lengths[cell + 1]);
      }
    }
    while (i < targetEnd && j < inputEnd) {
      const cell = (i - start) * columns + j - start;
      if (target[i] === input[j]) {
        append("equal", target[i]);
        i++;
        j++;
      } else if (lengths[cell + columns] >= lengths[cell + 1]) {
        append("missing", target[i++]);
      } else {
        append("extra", input[j++]);
      }
    }
  }
  append("missing", target.slice(i, targetEnd).join(""));
  append("extra", input.slice(j, inputEnd).join(""));
  append("equal", target.slice(targetEnd).join(""));
  return differences;
}
