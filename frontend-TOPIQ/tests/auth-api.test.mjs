import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import ts from "typescript";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const source = await readFile(new URL("../src/lib/auth-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
let counter = 0;
const freshApi = () => import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}#${counter++}`);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
const user = { id: 1, email: "synthetic@example.invalid", nickname: "Learner" };

test("return paths stay on TOPIQ and cannot loop through auth pages", async () => {
  const { safeReturnPath } = await freshApi();
  for (const path of [null, "https://evil.example", "//evil.example", "/\\evil.example", "/login?next=/", "/signup", "/verify-email#token=fixture", "/hello\nworld"]) {
    assert.equal(safeReturnPath(path), "/");
  }
  assert.equal(safeReturnPath("/vocabulary?set=1#review"), "/vocabulary?set=1#review");
});

test("normalized return paths cannot become external navigation", async () => {
  const { safeReturnPath } = await freshApi();
  const origin = "https://topiq.example.invalid";
  for (const path of ["/a/..//example.invalid", "/a/%2e%2e//example.invalid", "/.//example.invalid"]) {
    const result = safeReturnPath(path);
    assert.equal(result, "/");
    assert.equal(new URL(result, origin).origin, origin);
  }
  assert.equal(safeReturnPath("/guide/../vocabulary?set=1#review"), "/vocabulary?set=1#review");
});

test("email send uses CSRF, language and an internal return path without expecting a user", async () => {
  const api = await freshApi();
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
  const api = await freshApi();
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
  globalThis.fetch = async () => json({ email: user.email, expiresAt: "invalid" });
  await assert.rejects(api.verifyEmail("synthetic-proof"), error => error.code === "server_error");
});

test("expiry, provider failure and resend cooldown remain distinct errors", async () => {
  const api = await freshApi();
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
  const api = await freshApi();
  globalThis.fetch = async () => json({ error: "authentication_required" }, 401);
  assert.equal(await api.getSession(), null);
  globalThis.fetch = async () => { throw new TypeError("offline"); };
  await assert.rejects(api.getSession(), error => error.code === "network_error");
  globalThis.fetch = async () => json({ error: "server_error" }, 500);
  await assert.rejects(api.getSession(), error => error.code === "server_error");
});

test("session data is validated and requested without shared caching", async () => {
  const api = await freshApi();
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
  const api = await freshApi();
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
  const api = await freshApi();
  let posts = 0;
  globalThis.fetch = async path => path === "/api/csrf/" ? json({ csrfToken: "token" })
    : (posts++, json({ error: "csrf_failed" }, 403));
  await assert.rejects(api.signIn(user.email, "synthetic-only"), error => error.code === "csrf_failed");
  assert.equal(posts, 2);
  globalThis.fetch = async () => json({ error: "validation_error", fields: { email: ["email_unavailable"] } }, 400);
  await assert.rejects(api.signIn(user.email, "synthetic-only"), error => error.fields.email[0] === "email_unavailable");
});

test("rotated token is used for logout and 204 needs no JSON body", async () => {
  const api = await freshApi();
  let tokens = 0;
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: `initial-${++tokens}` });
    if (path === "/api/auth/logout/") {
      assert.equal(options.headers["X-CSRFToken"], "rotated");
      return new Response(null, { status: 204 });
    }
    return json({ user, csrfToken: "rotated" });
  };
  await api.signIn(user.email, "synthetic-only");
  await api.signOut();
  await api.signIn(user.email, "synthetic-only");
  assert.equal(tokens, 2);
});
