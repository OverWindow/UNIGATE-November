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
export interface CreditBalance { balance: number; reserved: number; available: number; pendingRefundCredits?: number }
export interface CreditEntry { id: string; kind: "grant" | "reserve" | "capture" | "release" | "welcome" | "unlock" | "purchase" | "plan_bonus" | "refund" | "restore"; amount: number; evaluationId: string | null; setId: string | null; balanceAfter: number; reservedAfter: number; createdAt: string }
export interface TrialProgress {
  status: "awaiting_card" | "awaiting_consent" | "creating" | "started" | "card_used" | "account_used" | "ended" | "card_unavailable";
  endsAt?: string | null; consentVersion?: string | null; priceId?: string | null; amount?: number; currency?: string;
}
export interface CreditPurchaseStatus { id: string; status: "pending" | "fulfilled" | "expired"; trial?: TrialProgress | null }
export type RefundState = "eligible" | "contact" | "held" | "confirming" | "processing" | "refunded";
export interface TopupOrder {
  id: string; paidAt: string; amount: number; currency: string; credits: number;
  remainingCredits: number | null; refundState: RefundState;
}

export function refundTopup(id: string, signal: AbortSignal) {
  return mutateJson<{ refundState: RefundState }>("POST", `/api/credits/purchases/${id}/refund/`, {}, signal);
}
export interface CreditPrice { priceId: string; amount: number; currency: "krw"; credits: number }
export interface PlanOffer { months: number; priceId: string | null; amount: number; currency: "krw"; bonusCredits: number; trialDays: number }
export interface ScheduledPlanChange { id: string; months: number; effectiveAt: string; amount: number }
interface PlanAccess {
  active: boolean; endsAt: string | null; currentPlanMonths: number | null;
  subscription: { state: "active" | "trialing" | "ending" | "past_due"; months: number } | null;
  trialEndsAt?: string | null; firstChargeAmount?: number | null;
  nextBillingAt: string | null; canChangePlan: boolean; scheduledChange: ScheduledPlanChange | null;
  planChangeUnavailable?: boolean;
}
export interface SubscriptionAccount extends PlanAccess { canOpenBillingPortal: boolean }
export interface PlanAccount extends PlanAccess { plans: PlanOffer[]; trialEligible: boolean }
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

async function mutateJson<T>(method: "POST" | "DELETE", path: string, body: object, signal: AbortSignal, timeout = 15000): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { csrfToken } = await requestJson<{ csrfToken: string }>("/api/csrf/", signal);
    try {
      return await requestJson<T>(path, signal, {
        method, headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken }, body: JSON.stringify(body),
      }, timeout);
    } catch (error) {
      // Only a CSRF rejection guarantees that the operation was never started.
      if (!(error instanceof WritingError) || error.code !== "csrf_failed" || attempt > 0) throw error;
    }
  }
  throw new WritingError(403, "csrf_failed");
}

export function submitWriting(body: Submission, signal: AbortSignal, timeoutSeconds: number): Promise<Evaluation> {
  return mutateJson("POST", "/api/writing/evaluations/", body, signal, (timeoutSeconds + 20) * 1000);
}

export function unlockWriting(setId: string, signal: AbortSignal): Promise<{ setId: string; unlocked: boolean; chargedCredits: number; credits: CreditBalance }> {
  return mutateJson("POST", `/api/writing/sets/${setId}/unlock/`, {}, signal);
}

export function startCreditPurchase(attemptId: string, priceId: string, signal: AbortSignal) {
  return mutateJson<CreditPurchaseStatus & { checkoutUrl: string | null }>("POST", "/api/credits/purchases/", { attemptId, priceId }, signal);
}

export function getPlans(signal: AbortSignal) {
  return requestJson<PlanAccount>("/api/plans/", signal);
}

export function getMySubscription(signal: AbortSignal) {
  return requestJson<SubscriptionAccount>("/api/subscriptions/me/", signal);
}

export function schedulePlanChange(months: number, priceId: string, effectiveAt: string, signal: AbortSignal) {
  return mutateJson<{ scheduledChange: ScheduledPlanChange }>("POST", "/api/subscriptions/me/plan-change/", { months, priceId, effectiveAt }, signal);
}

export function cancelPlanChange({ id, months, effectiveAt }: ScheduledPlanChange, signal: AbortSignal) {
  return mutateJson<{ scheduledChange: null }>("DELETE", "/api/subscriptions/me/plan-change/", { id, months, effectiveAt }, signal);
}

export function startPlanPurchase(attemptId: string, priceId: string, months: number, signal: AbortSignal) {
  const body = months === 1 ? { attemptId, priceId, months, offer: "monthly_trial" } : { attemptId, priceId, months };
  return mutateJson<CreditPurchaseStatus & { checkoutUrl: string | null }>("POST", "/api/plans/purchases/", body, signal);
}

export interface TrialQuote { endsAt: string; consentVersion: string; priceId: string; amount: number; currency: string }

export function trialQuote(trial: TrialProgress): TrialQuote | null {
  const { endsAt, consentVersion, priceId, amount, currency } = trial;
  if (trial.status !== "awaiting_consent" || !endsAt || !Number.isFinite(Date.parse(endsAt)) || !consentVersion
    || !priceId || typeof amount !== "number" || !Number.isSafeInteger(amount) || amount <= 0 || currency !== "krw") return null;
  return { endsAt, consentVersion, priceId, amount, currency };
}

export function confirmMonthlyTrial(purchaseId: string, quote: TrialQuote, signal: AbortSignal) {
  return mutateJson<CreditPurchaseStatus>("POST", "/api/plans/purchases/", {
    action: "confirm_trial", purchaseId, priceId: quote.priceId, consentVersion: quote.consentVersion, trialEndsAt: quote.endsAt,
  }, signal);
}

type BillingPage = "credits" | "plans" | "settings/subscription" | `${Exclude<Language, "ko">}/settings/subscription`;
export function openBillingPortal(signal: AbortSignal, from: BillingPage = "credits") {
  return mutateJson<{ portalUrl: string | null }>("POST", "/api/credits/billing-portal/", from === "credits" ? {} : { from }, signal);
}

export function creditsRequest<T>(path: string, signal: AbortSignal): Promise<T> {
  return requestJson<T>(`/api/credits/${path}`, signal);
}
