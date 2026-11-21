import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { setCsrfToken } from "../src/lib/csrf.ts";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
beforeEach(() => setCsrfToken(null));
async function loadApi(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const code = compiled.replace('"../csrf"', JSON.stringify(new URL("../src/lib/csrf.ts", import.meta.url).href));
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const api = await loadApi("../src/lib/auth/auth-api.ts");
const { pbtRequest, submitOnPageExit } = await loadApi("../src/lib/exam/pbt-api.ts");
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const user = { id: 1, email: "synthetic@example.invalid", nickname: "Learner" };

test("Google posts use same-origin CSRF, bind the pending flow and rotate CSRF after linking", async () => {
  const step = { step: "link", email: user.email, flow: "pending", expiresAt: 12345, needsEmail: false };
  const calls = [];
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: "initial" });
    calls.push([path, JSON.parse(options.body), options.headers["X-CSRFToken"]]);
    assert.equal(options.credentials, "same-origin");
    if (path.endsWith("/start/")) return json({ enabled: true, clientId: "client", nonce: "nonce" });
    if (path.endsWith("/google/")) return json(step);
    if (path.endsWith("/link/")) return json({ user, csrfToken: "rotated" });
    return new Response(null, { status: 204 });
  };
  assert.deepEqual(await api.startGoogle(), { clientId: "client", nonce: "nonce" });
  assert.deepEqual(await api.verifyGoogle("fixture"), step);
  assert.deepEqual(await api.linkGoogle(step.flow, "password"), user);
  await api.signOut();
  assert.deepEqual(calls, [
    ["/api/auth/google/start/", {}, "initial"], ["/api/auth/google/", { credential: "fixture" }, "initial"],
    ["/api/auth/google/link/", { flow: "pending", password: "password" }, "initial"],
    ["/api/auth/logout/", {}, "rotated"],
  ]);
});

test("external-email Google signup carries the same flow through email verification and completion", async () => {
  const input = { nickname: "Learner", language: "en", verification_token: "proof", survey: {} };
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: "csrf" });
    const body = JSON.parse(options.body);
    if (path.endsWith("/send/")) {
      assert.equal(body.google_flow, "flow");
      return json({ status: "verification_sent", retryAfter: 60 });
    }
    if (path.endsWith("/verify/")) return json({ email: user.email, expiresAt: 12345, language: "en", next: "/credits", googleFlow: "flow" });
    assert.equal(path, "/api/auth/google/signup/");
    assert.deepEqual(body, { ...input, flow: "flow" });
    return json({ user });
  };
  await api.sendEmailVerification(user.email, "en", "/credits", "flow");
  const proof = await api.verifyEmail("proof");
  assert.equal(proof.googleFlow, "flow");
  assert.deepEqual(await api.finishGoogleSignup(proof.googleFlow, { ...input, email: "ignored", password: "ignored" }), user);
});

test("return paths stay on TOPIQ and cannot loop through auth pages", async () => {
  const { safeReturnPath } = api;
  for (const path of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/login?next=/", "/signup", "/verify-email#token=fixture", "/hello\nworld"]) {
    assert.equal(safeReturnPath(path), "/");
  }
  assert.equal(safeReturnPath("/vocabulary?set=1#review"), "/vocabulary?set=1#review");
});

test("normalized return paths cannot become external navigation", async () => {
  const { safeReturnPath } = api;
  const origin = "https://topiq.example.invalid";
  for (const path of ["/a/..//example.invalid", "/a/%2e%2e//example.invalid", "/.//example.invalid"]) {
    const result = safeReturnPath(path);
    assert.equal(result, "/");
    assert.equal(new URL(result, origin).origin, origin);
  }
  assert.equal(safeReturnPath("/guide/../vocabulary?set=1#review"), "/vocabulary?set=1#review");
});

test("email send uses CSRF, language and an internal return path without expecting a user", async () => {
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: "token" });
    assert.equal(path, "/api/auth/email/send/");
    assert.equal(options.headers["X-CSRFToken"], "token");
    assert.deepEqual(JSON.parse(options.body), { email: user.email, language: "id", next: "/" });
    return json({ status: "verification_sent", retryAfter: 60 }, 202);
  };
  assert.equal(await api.sendEmailVerification(user.email, "id", "https://evil.example"), 60);
});

test("verified email proof is submitted with signup and response data is validated", async () => {
  const survey = { nationalityCode: "ID", birthYear: 2000, topikReasons: ["employment"], topikReasonOther: "",
    koreanStudyDuration: "1_to_2_years", topikExperience: "none", currentTopikLevel: null,
    targetTopikLevel: 4, privacyConsent: true, privacyConsentVersion: "topiq_signup_privacy_v1" };
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: "token" });
    const body = JSON.parse(options.body);
    if (path === "/api/auth/email/verify/") {
      assert.deepEqual(body, { token: "synthetic-proof" });
      return json({ email: user.email, language: "en", next: "/#faq", expiresAt });
    }
    assert.equal(body.verification_token, "synthetic-proof");
    assert.equal(body.language, "en");
    assert.deepEqual(body.survey, survey);
    assert.equal("rating" in body, false);
    return json({ user, csrfToken: "rotated" }, 201);
  };
  const proof = await api.verifyEmail("synthetic-proof");
  assert.deepEqual(proof, { email: user.email, token: "synthetic-proof", language: "en", next: "/#faq", expiresAt });
  assert.deepEqual(await api.signUp({ email: proof.email, nickname: user.nickname, password: "synthetic-only",
    password_confirm: "synthetic-only", verification_token: proof.token, language: "en", survey }), user);
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/pbt/attempts/");
    assert.equal(options.headers["X-CSRFToken"], "rotated");
    return json({});
  };
  await pbtRequest("attempts/", "POST", {});
  globalThis.fetch = async () => json({ email: user.email, expiresAt: "invalid" });
  await assert.rejects(api.verifyEmail("synthetic-proof"), error => error.code === "server_error");
});

test("expiry, provider failure and resend cooldown remain distinct errors", async () => {
  let code = "email_verification_expired";
  globalThis.fetch = async path => {
    if (path === "/api/csrf/") return json({ csrfToken: "token" });
    return json({ error: code }, code === "email_delivery_unavailable" ? 503 : 400);
  };
  await assert.rejects(api.verifyEmail("synthetic-proof"), error => error.code === code);
  code = "email_delivery_unavailable";
  await assert.rejects(api.sendEmailVerification(user.email, "ko", "/"), error => error.code === code);
  globalThis.fetch = async () => new Response(JSON.stringify({ error: "rate_limited" }), {
    status: 429, headers: { "Content-Type": "application/json", "Retry-After": "42" },
  });
  await assert.rejects(api.sendEmailVerification(user.email, "ko", "/"), error => error.code === "rate_limited" && error.retryAfter === 42);
});

test("anonymous session is different from failed connection", async () => {
  globalThis.fetch = async () => json({ error: "authentication_required" }, 401);
  assert.equal(await api.getSession(), null);
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(api.getSession(), error => error.code === "network_error");
  globalThis.fetch = async () => json({ error: "server_error" }, 500);
  await assert.rejects(api.getSession(), error => error.code === "server_error");
});

test("session data is validated and requested without shared caching", async () => {
  globalThis.fetch = async (path, options) => {
    assert.equal(path, "/api/auth/me/");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    return json({ user });
  };
  assert.deepEqual(await api.getSession(), user);
  globalThis.fetch = async () => json({ user: { id: "invalid" } });
  await assert.rejects(api.getSession(), error => error.code === "server_error");
});

test("login refreshes a rejected CSRF token once", async () => {
  let tokens = 0;
  let posts = 0;
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: `token-${++tokens}` });
    posts += 1;
    assert.equal(options.headers["X-CSRFToken"], `token-${tokens}`);
    return posts === 1 ? json({ error: "csrf_failed" }, 403) : json({ user, csrfToken: "rotated" });
  };
  assert.deepEqual(await api.signIn(user.email, "synthetic-only"), user);
  assert.equal(tokens, 2);
  assert.equal(posts, 2);
});

test("CSRF retry is bounded and field errors remain available", async () => {
  let posts = 0;
  globalThis.fetch = async path => path === "/api/csrf/" ? json({ csrfToken: "token" })
    : (posts++, json({ error: "csrf_failed" }, 403));
  await assert.rejects(api.signIn(user.email, "synthetic-only"), error => error.code === "csrf_failed");
  assert.equal(posts, 2);
  globalThis.fetch = async path => path === "/api/csrf/" ? json({ csrfToken: "fresh" })
    : json({ error: "validation_error", fields: { email: ["email_unavailable"] } }, 400);
  await assert.rejects(api.signIn(user.email, "synthetic-only"), error => error.fields.email[0] === "email_unavailable");
});

test("exam writes share the login token and fetch a fresh token after logout", async () => {
  let tokens = 0;
  const examTokens = [];
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: `initial-${++tokens}` });
    if (path === "/api/ibt/attempts/") {
      examTokens.push(options.headers["X-CSRFToken"]);
      return json({});
    }
    if (path === "/api/auth/logout/") {
      assert.equal(options.headers["X-CSRFToken"], "rotated");
      return new Response(null, { status: 204 });
    }
    assert.equal(path, "/api/auth/login/");
    return json({ user, csrfToken: "rotated" });
  };
  await api.signIn(user.email, "synthetic-only");
  await pbtRequest("attempts/", "POST", {}, "ibt");
  await api.signOut();
  await pbtRequest("attempts/", "POST", {}, "ibt");
  assert.deepEqual(examTokens, ["rotated", "initial-2"]);
  assert.equal(tokens, 2);
});

test("a token lookup started before login cannot overwrite the rotated token", async () => {
  setCsrfToken("before-login");
  const loginResponse = Promise.withResolvers();
  const lookupStarted = Promise.withResolvers();
  const lookupResponse = Promise.withResolvers();
  const examTokens = [];
  globalThis.fetch = async (path, options) => {
    if (path === "/api/auth/login/") return loginResponse.promise;
    if (path === "/api/csrf/") {
      lookupStarted.resolve();
      return lookupResponse.promise;
    }
    examTokens.push(options.headers["X-CSRFToken"]);
    return examTokens.length === 1 ? json({ error: "csrf_failed" }, 403) : json({});
  };
  const login = api.signIn(user.email, "synthetic-only");
  const answer = pbtRequest("attempts/test/answers/1/", "PUT", { selectedOption: 1 });
  await lookupStarted.promise;
  loginResponse.resolve(json({ user, csrfToken: "after-login" }));
  await login;
  lookupResponse.resolve(json({ csrfToken: "stale" }));
  await answer;
  submitOnPageExit("test", "pbt");
  assert.deepEqual(examTokens, ["before-login", "after-login", "after-login"]);
});
