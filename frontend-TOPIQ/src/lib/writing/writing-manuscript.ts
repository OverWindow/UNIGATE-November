export const manuscriptColumns = 25;

interface ManuscriptPart { text: string; start: number; end: number }
export interface ManuscriptCell { parts: ManuscriptPart[] }
export interface ManuscriptStop { offset: number; position: number }
export interface ManuscriptLayout {
  cells: (ManuscriptCell | null)[]; stops: ManuscriptStop[]; usedCells: number; rows: number;
}

const segmenter = new Intl.Segmenter("ko", { granularity: "grapheme" });
const halfWidth = /^[a-zA-Z0-9]$/;
const closing = /^[.,!?;:。，、！？…”’」』）)\]}]$/;
const opening = /^[“‘「『（([{]$/;

export function layoutManuscript(value: string, minimumCells: number): ManuscriptLayout {
  const segments = Array.from(segmenter.segment(value));
  const cells: (ManuscriptCell | null)[] = [];
  const stops: ManuscriptStop[] = [];
  let position = 0;

  function stop(offset: number, at: number) {
    const last = stops.at(-1);
    if (last?.offset === offset) last.position = at;
    else stops.push({ offset, position: at });
  }

  // Indentation and line padding belong to the paper, never to the submitted text.
  function indent(next: string | undefined) {
    if (!next || !/^[ \t\u3000]/.test(next)) position++;
  }
  indent(segments[0]?.segment);
  stop(0, position);

  for (let index = 0; index < segments.length; index++) {
    const current = segments[index];
    const part = { text: current.segment, start: current.index, end: current.index + current.segment.length };
    if (/^[\r\n]+$/.test(part.text)) {
      stop(part.start, position);
      position = Math.ceil(position / manuscriptColumns) * manuscriptColumns;
      indent(segments[index + 1]?.segment);
      stop(part.end, position);
      continue;
    }

    if (opening.test(part.text) && position % manuscriptColumns === manuscriptColumns - 1
      && segments[index + 1] && !/^[\r\n]+$/.test(segments[index + 1].segment)) position++;

    const previous = cells[position - 1];
    if (closing.test(part.text) && position % manuscriptColumns === 0 && previous?.parts.length === 1) {
      previous.parts.push(part);
      stop(part.start, position - 0.5);
      stop(part.end, position);
      continue;
    }

    const parts = [part];
    const next = segments[index + 1];
    if (halfWidth.test(part.text) && next && halfWidth.test(next.segment)) {
      parts.push({ text: next.segment, start: next.index, end: next.index + next.segment.length });
      index++;
    }
    cells[position] = { parts };
    parts.forEach((entry, partIndex) => stop(entry.start, position + partIndex / parts.length));
    position++;
    stop(parts[parts.length - 1].end, position);
  }

  const rows = Math.max(Math.ceil(minimumCells / manuscriptColumns), Math.floor(position / manuscriptColumns) + 1);
  return { cells: Array.from({ length: rows * manuscriptColumns }, (_, index) => cells[index] ?? null), stops, usedCells: position, rows };
}

export function manuscriptPosition(layout: ManuscriptLayout, offset: number): number {
  let position = layout.stops[0].position;
  for (const stop of layout.stops) {
    if (stop.offset > offset) break;
    position = stop.position;
  }
  return position;
}

export function manuscriptOffsetAt(layout: ManuscriptLayout, row: number, column: number): number {
  const targetRow = Math.max(0, Math.min(layout.rows - 1, row));
  const rowStops = layout.stops.filter(stop => stop.position >= targetRow * manuscriptColumns && stop.position <= (targetRow + 1) * manuscriptColumns);
  if (!rowStops.length) return layout.stops.at(-1)!.offset;
  const position = targetRow * manuscriptColumns + Math.max(0, Math.min(manuscriptColumns, column));
  return rowStops.reduce((nearest, stop) => Math.abs(stop.position - position) < Math.abs(nearest.position - position) ? stop : nearest).offset;
}
