import type { Language } from "./landing-content";
import type { SurveyInput } from "./learner-survey";

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
}

export interface SignupInput {
  email: string;
  nickname: string;
  password: string;
  password_confirm: string;
  verification_token: string;
  language: Language;
  survey: SurveyInput;
}

export interface VerifiedEmail {
  email: string;
  token: string;
  language: Language;
  next: string;
  expiresAt: number;
}

export class AuthError extends Error {
  constructor(
    public code: string,
    public status = 0,
    public fields: Record<string, string[]> = {},
    public retryAfter = 0,
  ) {
    super(code);
    this.name = "AuthError";
  }
}

let csrfToken: string | null = null;

async function request(path: string, options: RequestInit = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(path, {
      ...options, credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
  } catch {
    throw new AuthError("network_error");
  } finally {
    clearTimeout(timer);
  }
}

async function readJson(response: Response) {
  try {
    const data: unknown = await response.json();
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("Invalid response");
    return data as Record<string, unknown>;
  } catch {
    throw new AuthError("server_error", response.status);
  }
}

async function getCsrfToken(): Promise<string> {
  const response = await request("/api/csrf/");
  if (!response.ok) throw new AuthError("server_error", response.status);
  const data = await readJson(response);
  if (typeof data.csrfToken !== "string") throw new AuthError("server_error");
  csrfToken = data.csrfToken;
  return data.csrfToken;
}

function parseUser(value: unknown): AuthUser {
  if (!value || typeof value !== "object" || !("id" in value) ||
      typeof value.id !== "number" || !("email" in value) || typeof value.email !== "string" ||
      !("nickname" in value) || typeof value.nickname !== "string") {
    throw new AuthError("server_error");
  }
  return { id: value.id, email: value.email, nickname: value.nickname };
}

async function post(path: string, body: object, retryCsrf = true): Promise<Record<string, unknown> | null> {
  const token = csrfToken || await getCsrfToken();
  const response = await request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": token },
    body: JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const data = await readJson(response);
  // CSRF rejection happens before the view, so a single refreshed retry is safe.
  if (response.status === 403 && data.error === "csrf_failed" && retryCsrf) {
    csrfToken = null;
    return post(path, body, false);
  }
  if (!response.ok) {
    const fields: Record<string, string[]> = {};
    if (data.fields && typeof data.fields === "object") {
      for (const [name, codes] of Object.entries(data.fields)) {
        if (Array.isArray(codes) && codes.every(code => typeof code === "string")) fields[name] = codes;
      }
    }
    const retryAfter = Number(response.headers.get("Retry-After"));
    throw new AuthError(typeof data.error === "string" ? data.error : "server_error", response.status, fields,
      Number.isFinite(retryAfter) ? Math.max(0, Math.min(3600, retryAfter)) : 0);
  }
  if (typeof data.csrfToken === "string") csrfToken = data.csrfToken;
  return data;
}

export async function getSession(): Promise<AuthUser | null> {
  const response = await request("/api/auth/me/");
  if (response.status === 401) return null;
  if (!response.ok) throw new AuthError("server_error", response.status);
  return parseUser((await readJson(response)).user);
}

export async function signIn(email: string, password: string): Promise<AuthUser> {
  const result = await post("/api/auth/login/", { email, password });
  if (!result) throw new AuthError("server_error");
  return parseUser(result.user);
}

export async function signUp(input: SignupInput): Promise<AuthUser> {
  const result = await post("/api/auth/signup/", input);
  if (!result) throw new AuthError("server_error");
  return parseUser(result.user);
}

export async function sendEmailVerification(email: string, language: Language, next: string): Promise<number> {
  const data = await post("/api/auth/email/send/", { email, language, next: safeReturnPath(next) });
  if (data?.status !== "verification_sent" || typeof data.retryAfter !== "number" ||
      !Number.isFinite(data.retryAfter) || data.retryAfter < 0) throw new AuthError("server_error");
  return data.retryAfter;
}

export async function verifyEmail(token: string): Promise<VerifiedEmail> {
  const data = await post("/api/auth/email/verify/", { token });
  if (!data || typeof data.email !== "string" || typeof data.expiresAt !== "number" ||
      !Number.isFinite(data.expiresAt) || !["ko", "en", "id"].includes(String(data.language)) ||
      typeof data.next !== "string") throw new AuthError("server_error");
  return { email: data.email, token, language: data.language as Language,
    next: safeReturnPath(data.next), expiresAt: data.expiresAt };
}

export async function signOut() {
  await post("/api/auth/logout/", {});
  csrfToken = null;
}

export function safeReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\") ||
      [...value].some(character => character.charCodeAt(0) < 32)) return "/";
  const parsed = new URL(value, "https://topiq.unigate.kr");
  if (parsed.origin !== "https://topiq.unigate.kr" || parsed.pathname.startsWith("//") ||
      /^\/(login|signup|verify-email)(\/|$)/.test(parsed.pathname)) return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

