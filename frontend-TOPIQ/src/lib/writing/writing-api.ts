import type { Language } from "../landing-content";

export interface WritingSet { id: string; number: number; questionCount: number; submittedSlots: number[]; unlocked: boolean; setCost: number }
export interface WritingMaterial {
  kind: "bar" | "line" | "table"; title: string; unit: string; categories?: string[];
  series?: { label: string; values: number[] }[]; columns?: string[]; rows?: string[][];
}
export interface WritingQuestion {
  number: number; instruction: string; topic: string; passage: string; contextTitle: string;
  requirements: string[]; materials: WritingMaterial[]; materialNotes: string[]; dataSource: string;
  imageUrl: string;
}
export interface EvaluationUsage { used: number; pending: number; remaining: number; limit: number }
export interface WritingDetail extends WritingSet { questions: WritingQuestion[]; evaluationUsage: Record<number, EvaluationUsage> }

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
export interface EvaluationConfig { questionPrices: Record<number, number>; setCost: number; evaluationLimit: number; enabled: boolean; priceVersion: string; timeoutSeconds: number }
export interface CreditBalance { balance: number; reserved: number; available: number }
export interface CreditEntry { id: string; kind: "grant" | "reserve" | "capture" | "release" | "welcome" | "unlock" | "purchase"; amount: number; evaluationId: string | null; setId: string | null; balanceAfter: number; reservedAfter: number; createdAt: string }
export interface CreditPurchaseStatus { id: string; status: "pending" | "fulfilled" | "expired" }
export interface CreditPrice { priceId: string; amount: number; currency: "krw"; credits: number }
export interface Evaluation {
  id: string; setId: string; typeSlot: number; status: "processing" | "succeeded" | "failed";
  totalScore: number | null; maxScore: number; creditCost: number; chargedCredits: number;
  createdAt: string; completedAt: string | null; error: string;
  feedbackLanguage: Language;
  usage?: EvaluationUsage;
  answer?: LearnerAnswer;
  question?: { instruction: string; passage: string; topic: string; context_title: string; materials: WritingMaterial[]; material_notes: string[]; requirements: string[]; data_source: string; image_url?: string };
  result?: {
    scores: Record<string, { score: number; rationale: string; quotes: string[] }>;
    task_checks: { requirement_id: string; status: string; reason: string; quotes: string[] }[];
    corrections: { original: string; suggestion: string; reason: string }[];
    summary: string; review_reasons: string[];
  } | null;
}
export interface Submission { id: string; setId: string; typeSlot: number; answer: LearnerAnswer; priceVersion: string; feedbackLanguage: Language }

async function postJson<T>(path: string, body: object, signal: AbortSignal, timeout = 15000): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { csrfToken } = await requestJson<{ csrfToken: string }>("/api/csrf/", signal);
    try {
      return await requestJson<T>(path, signal, {
        method: "POST", headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken }, body: JSON.stringify(body),
      }, timeout);
    } catch (error) {
      // Only a CSRF rejection guarantees that the operation was never started.
      if (!(error instanceof WritingError) || error.code !== "csrf_failed" || attempt > 0) throw error;
    }
  }
  throw new WritingError(403, "csrf_failed");
}

export function submitWriting(body: Submission, signal: AbortSignal, timeoutSeconds: number): Promise<Evaluation> {
  return postJson("/api/writing/evaluations/", body, signal, (timeoutSeconds + 20) * 1000);
}

export function unlockWriting(setId: string, signal: AbortSignal): Promise<{ setId: string; unlocked: boolean; chargedCredits: number; credits: CreditBalance }> {
  return postJson(`/api/writing/sets/${setId}/unlock/`, {}, signal);
}

export function startCreditPurchase(attemptId: string, priceId: string, signal: AbortSignal) {
  return postJson<CreditPurchaseStatus & { checkoutUrl: string | null }>("/api/credits/purchases/", { attemptId, priceId }, signal);
}

export function openBillingPortal(signal: AbortSignal) {
  return postJson<{ portalUrl: string | null }>("/api/credits/billing-portal/", {}, signal);
}

export function creditsRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  return requestJson<T>(`/api/credits/${path}`, signal);
}
