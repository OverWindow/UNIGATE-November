type ApiError = new (code: string, status: number) => Error;
type TokenResult = { token: string } | { error: string; status: number };

export let csrfToken: string | null = null;
let pending: Promise<TokenResult> | null = null;

export function setCsrfToken(token: string | null) {
  csrfToken = token;
  pending = null;
}

async function fetchToken(): Promise<TokenResult> {
  let response: Response;
  try {
    response = await fetch("/api/csrf/", {
      credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { error: "network_error", status: 0 };
  }
  const data = response.ok ? await response.json().catch(() => null) : null;
  if (typeof data?.csrfToken !== "string" || !data.csrfToken) return { error: "server_error", status: response.status };
  return { token: data.csrfToken };
}

async function getCsrfToken(ErrorType: ApiError): Promise<string> {
  while (!csrfToken) {
    const request = pending ??= fetchToken();
    const result = await request;
    if ("error" in result) {
      if (pending === request) pending = null;
      throw new ErrorType(result.error, result.status);
    }
    // Login or logout may have replaced the token while this lookup was in flight.
    if (pending === request) setCsrfToken(result.token);
  }
  return csrfToken;
}

export async function withCsrfToken(ErrorType: ApiError, send: (token: string) => Promise<Response>) {
  for (let attempt = 0; ; attempt++) {
    const token = await getCsrfToken(ErrorType);
    const response = await send(token);
    if (response.status !== 403) return response;
    const data = await response.clone().json().catch(() => null);
    if (data?.error !== "csrf_failed") return response;

    // A late rejection must not invalidate another request's refreshed token.
    if (csrfToken === token) setCsrfToken(null);
    if (attempt === 1) return response;
  }
}
