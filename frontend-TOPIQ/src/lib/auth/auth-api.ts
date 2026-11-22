import { setCsrfToken, withCsrfToken } from "../csrf";
import type { Language } from "../landing-content";
import type { SurveyInput } from "../learner-survey";

export interface AuthUser {
  id: number;
  email: string;
  nickname: string;
  plusEndsAt: string | null;
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
  googleFlow?: string;
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

function parseUser(value: unknown): AuthUser {
  if (!value || typeof value !== "object" || !("id" in value) ||
      typeof value.id !== "number" || !("email" in value) || typeof value.email !== "string" ||
      !("nickname" in value) || typeof value.nickname !== "string") {
    throw new AuthError("server_error");
  }
  const end = "plusEndsAt" in value ? value.plusEndsAt : null;
  return { id: value.id, email: value.email, nickname: value.nickname,
    plusEndsAt: typeof end === "string" && Number.isFinite(Date.parse(end)) ? end : null };
}

async function post(path: string, body: object): Promise<Record<string, unknown> | null> {
  const response = await withCsrfToken(AuthError, token => request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRFToken": token },
    body: JSON.stringify(body),
  }));
  if (response.status === 204) return null;
  const data = await readJson(response);
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
  if (typeof data.csrfToken === "string") setCsrfToken(data.csrfToken);
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

export interface GoogleStep {
  step: "link" | "signup";
  email: string;
  flow: string;
  needsEmail: boolean;
  expiresAt: number;
}

export async function startGoogle() {
  const data = await post("/api/auth/google/start/", {});
  if (data?.enabled === false) return null;
  if (data?.enabled !== true || typeof data.clientId !== "string" || typeof data.nonce !== "string") {
    throw new AuthError("server_error");
  }
  return { clientId: data.clientId, nonce: data.nonce };
}

export async function verifyGoogle(credential: string): Promise<GoogleStep | AuthUser> {
  const data = await post("/api/auth/google/", { credential });
  if (data?.user) return parseUser(data.user);
  if (!data || (data.step !== "signup" && data.step !== "link") || typeof data.email !== "string" ||
      typeof data.flow !== "string" || typeof data.needsEmail !== "boolean" || typeof data.expiresAt !== "number") {
    throw new AuthError("server_error");
  }
  return { step: data.step, email: data.email, flow: data.flow, needsEmail: data.needsEmail, expiresAt: data.expiresAt };
}

export async function finishGoogleSignup(flow: string, input: Pick<SignupInput, "nickname" | "survey" | "language" | "verification_token">) {
  const data = await post("/api/auth/google/signup/", { flow, nickname: input.nickname, survey: input.survey,
    language: input.language, verification_token: input.verification_token });
  return parseUser(data?.user);
}

export async function linkGoogle(flow: string, password: string) {
  return parseUser((await post("/api/auth/google/link/", { flow, password }))?.user);
}

export async function sendEmailVerification(email: string, language: Language, next: string, googleFlow?: string): Promise<number> {
  const data = await post("/api/auth/email/send/", { email, language, next: safeReturnPath(next),
    ...(googleFlow && { google_flow: googleFlow }) });
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
    next: safeReturnPath(data.next), expiresAt: data.expiresAt,
    ...(typeof data.googleFlow === "string" && { googleFlow: data.googleFlow }) };
}

export async function signOut() {
  await post("/api/auth/logout/", {});
  setCsrfToken(null);
}

export function safeReturnPath(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\") ||
      [...value].some(character => character.charCodeAt(0) < 32)) return "/";
  const parsed = new URL(value, "https://topiq.unigate.kr");
  if (parsed.origin !== "https://topiq.unigate.kr" || parsed.pathname.startsWith("//") ||
      /^\/(login|signup|verify-email)(\/|$)/.test(parsed.pathname)) return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

