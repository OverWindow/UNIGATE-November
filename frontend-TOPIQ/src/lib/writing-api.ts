export interface WritingSet { id: string; number: number; questionCount: number; submittedSlots: number[] }
export interface WritingMaterial {
  kind: "bar" | "line" | "table"; title: string; unit: string; categories?: string[];
  series?: { label: string; values: number[] }[]; columns?: string[]; rows?: string[][];
}
export interface WritingQuestion {
  number: number; instruction: string; topic: string; passage: string; contextTitle: string;
  requirements: string[]; materials: WritingMaterial[]; materialNotes: string[]; dataSource: string;
  imageUrl: string;
}
export interface WritingDetail extends WritingSet { questions: WritingQuestion[] }

export class WritingError extends Error {
  constructor(public status: number, public code = "writing_unavailable") { super(code); }
}

export async function writingRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  return requestJson<T>(`/api/writing/${path}`, signal);
}

async function requestJson<T>(path: string, signal: AbortSignal, options: RequestInit = {}, timeout = 15000): Promise<T> {
  signal.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(path, {
      method: "GET", ...options, credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({})) as { error?: unknown };
      throw new WritingError(response.status, typeof data.error === "string" ? data.error : undefined);
    }
    return await response.json() as T;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export interface LearnerAnswer { a?: string; b?: string; text?: string }
export interface EvaluationConfig { prices: Record<number, number | null>; enabled: boolean; priceVersion: string; timeoutSeconds: number }
export interface CreditBalance { balance: number; reserved: number; available: number }
export interface CreditEntry { id: string; kind: "grant" | "reserve" | "capture" | "release"; amount: number; evaluationId: string | null; balanceAfter: number; reservedAfter: number; createdAt: string }
export interface Evaluation {
  id: string; setId: string; typeSlot: number; status: "processing" | "succeeded" | "failed";
  totalScore: number | null; maxScore: number; creditCost: number; chargedCredits: number;
  createdAt: string; completedAt: string | null; error: string;
  answer?: LearnerAnswer;
  question?: { instruction: string; passage: string; topic: string; context_title: string; materials: WritingMaterial[]; material_notes: string[]; requirements: string[]; data_source: string; image_url?: string };
  result?: {
    scores: Record<string, { score: number; rationale: string; quotes: string[] }>;
    task_checks: { requirement_id: string; status: string; reason: string; quotes: string[] }[];
    corrections: { original: string; suggestion: string; reason: string }[];
    summary: string; review_reasons: string[];
  } | null;
}
export interface Submission { id: string; setId: string; typeSlot: number; answer: LearnerAnswer; priceVersion: string }

export async function submitWriting(body: Submission, signal: AbortSignal, timeoutSeconds: number): Promise<Evaluation> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { csrfToken } = await requestJson<{ csrfToken: string }>("/api/csrf/", signal);
    try {
      return await requestJson<Evaluation>("/api/writing/evaluations/", signal, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken }, body: JSON.stringify(body),
      }, (timeoutSeconds + 20) * 1000);
    } catch (error) {
      // Only a CSRF rejection guarantees that the evaluation was never started.
      if (!(error instanceof WritingError) || error.code !== "csrf_failed" || attempt > 0) throw error;
    }
  }
  throw new WritingError(403, "csrf_failed");
}

export function creditsRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  return requestJson<T>(`/api/credits/${path}`, signal);
}
