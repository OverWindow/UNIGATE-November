export type Section = "reading" | "listening";
export type Mode = "practice" | "timed";
export interface ExamProgress {
  latestResult: { id: string; score: number; maxScore: number; submittedAt: string } | null;
  inProgressId: string | null;
}
export interface Exam {
  id: string; title: string; section: Section; round: number; questionCount: number;
  durationSeconds: number; guestAvailable: boolean; accessible: boolean;
  myProgress: Record<Mode, ExamProgress> | null;
}
export interface Question {
  position: number; itemType: string; prompt: string; passage: string; auxiliary: string;
  highlight: string; choices: string[]; visuals: Record<string, string>; materialUrl: string;
  audioUrl: string; selectedOption: number | null; correctAnswer?: number;
  explanation?: string; transcript?: string; isCorrect?: boolean; points?: number;
}
export interface Attempt {
  id: string; examId: string; title: string; section: Section; mode: Mode;
  status: "in_progress" | "submitted"; startedAt: string; expiresAt: string | null;
  submittedAt: string | null; timedOut: boolean; score: number | null; maxScore: number;
  serverNow: string; items: Question[];
}

export class PbtError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

async function fetchResponse(path: string, options: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(path, { ...options, credentials: "same-origin", cache: "no-store", signal: controller.signal });
  } catch {
    throw new PbtError("network_error");
  } finally { clearTimeout(timer); }
}

async function json(response: Response) {
  try { return await response.json(); }
  catch { throw new PbtError("server_error", response.status); }
}

export async function pbtRequest<T>(path: string, method = "GET", body?: object): Promise<T> {
  // Fetch fresh CSRF after login/logout, which rotates Django's token.
  const headers: Record<string, string> = {};
  if (method !== "GET") {
    const csrf = await fetchResponse("/api/csrf/", {});
    if (!csrf.ok) throw new PbtError("server_error", csrf.status);
    const token = (await json(csrf)).csrfToken;
    if (typeof token !== "string") throw new PbtError("server_error");
    headers["X-CSRFToken"] = token;
    headers["Content-Type"] = "application/json";
  }
  const response = await fetchResponse(`/api/pbt/${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (response.status === 404) throw new PbtError("not_found", 404);
  const data = await json(response);
  if (!response.ok) throw new PbtError(typeof data?.error === "string" ? data.error : response.status === 404 ? "not_found" : "server_error", response.status);
  return data as T;
}

export function remainingSeconds(attempt: Pick<Attempt, "expiresAt" | "serverNow">, elapsedMs: number) {
  return attempt.expiresAt === null ? null : Math.max(0, Math.ceil((Date.parse(attempt.expiresAt) - Date.parse(attempt.serverNow) - elapsedMs) / 1000));
}

export function clockText(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
