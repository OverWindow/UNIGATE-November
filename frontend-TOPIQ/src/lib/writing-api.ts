export interface WritingSet { id: string; number: number; questionCount: number }
export interface WritingMaterial {
  kind: "bar" | "line"; title: string; unit: string; categories: string[];
  series: { label: string; values: number[] }[];
}
export interface WritingQuestion {
  number: number; instruction: string; topic: string; passage: string; contextTitle: string;
  requirements: string[]; materials: WritingMaterial[]; materialNotes: string[]; dataSource: string;
}
export interface WritingDetail extends WritingSet { questions: WritingQuestion[] }

export class WritingError extends Error {
  constructor(public status: number) { super("writing_unavailable"); }
}

export async function writingRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/writing/${path}`, {
      method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) throw new WritingError(response.status);
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}
