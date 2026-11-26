import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import ts from "typescript";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const source = await readFile(new URL("../src/lib/writing/writing-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("reading writing prompts does not submit an evaluation or request CSRF", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push(path);
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    return Response.json({ sets: [] });
  };
  const controller = new AbortController();
  assert.deepEqual(await api.writingRequest("sets/", controller.signal), { sets: [] });
  assert.deepEqual(calls, ["/api/writing/sets/"]);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("credit checkout retries CSRF with the same attempt and quoted Price ID", async () => {
  let posts = 0;
  const attemptId = "b73071f7-5483-40d7-b61b-3a5ecf8ae60c";
  const priceId = "price_test_topiq";
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return Response.json({ csrfToken: `token-${posts}` });
    assert.equal(path, "/api/credits/purchases/");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-CSRFToken"], `token-${posts}`);
    assert.deepEqual(JSON.parse(options.body), { attemptId, priceId });
    return ++posts === 1 ? Response.json({ error: "csrf_failed" }, { status: 403 })
      : Response.json({ id: attemptId, status: "pending", checkoutUrl: "https://checkout.stripe.com/example" });
  };
  const order = await api.startCreditPurchase(attemptId, priceId, new AbortController().signal);
  assert.equal(posts, 2);
  assert.equal(order.status, "pending");
});

test("evaluation sends original answers and retries only a rejected CSRF request", async () => {
  const payload = { id: "synthetic-id", setId: "synthetic-set", typeSlot: 51, answer: { a: " \r\n원문 ", b: "" }, priceVersion: "v1", feedbackLanguage: "id" };
  const calls = [];
  let csrf = 0, posts = 0;
  globalThis.fetch = async (path, options) => {
    calls.push(path);
    if (path === "/api/csrf/") return Response.json({ csrfToken: `token-${++csrf}` });
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), payload);
    assert.equal(options.headers["X-CSRFToken"], `token-${csrf}`);
    return ++posts === 1 ? Response.json({ error: "csrf_failed" }, { status: 403 }) : Response.json({ id: payload.id, status: "succeeded" });
  };
  assert.equal((await api.submitWriting(payload, new AbortController().signal, 45)).status, "succeeded");
  assert.deepEqual(calls, ["/api/csrf/", "/api/writing/evaluations/", "/api/csrf/", "/api/writing/evaluations/"]);
});

test("monthly signup explicitly requests card setup; only a separate consent request confirms an exact quote", async () => {
  const posts = [];
  const signal = new AbortController().signal;
  const data = { status: "awaiting_consent", endsAt: "2099-09-20T01:45:16Z", priceId: "price-monthly",
    amount: 9900, currency: "krw", consentVersion: "trial-1" };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "test" });
    assert.equal(url, "/api/plans/purchases/");
    posts.push(JSON.parse(options.body));
    return Response.json({ id: "order", status: "pending" });
  };
  await api.startPlanPurchase("attempt", data.priceId, 1, signal);
  const quote = api.trialQuote(data);
  assert.ok(quote);
  await api.confirmMonthlyTrial("order", quote, signal);
  assert.deepEqual(posts, [
    { months: 1, priceId: data.priceId, attemptId: "attempt", offer: "monthly_trial" },
    { action: "confirm_trial", purchaseId: "order", priceId: data.priceId, trialEndsAt: data.endsAt, consentVersion: data.consentVersion },
  ]);
  for (const invalid of [{ status: "awaiting_card" }, { priceId: null }, { currency: "usd" }, { endsAt: "" }, { amount: 0 }]) {
    assert.equal(api.trialQuote({ ...data, ...invalid }), null);
  }
});

test("ambiguous failures never automatically repeat an evaluation", async () => {
  for (const failure of [new Error("network"), Response.json({ error: "writing_unavailable" }, { status: 503 })]) {
    let posts = 0;
    globalThis.fetch = async path => {
      if (path === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
      posts++;
      if (failure instanceof Error) throw failure;
      return failure;
    };
    await assert.rejects(api.submitWriting({ id: "stable-id" }, new AbortController().signal, 45));
    assert.equal(posts, 1);
  }
});

test("opening a set uses a CSRF protected POST without client price or buyer", async () => {
  const calls = [];
  let csrf = 0, posts = 0;
  globalThis.fetch = async (path, options) => {
    calls.push(path);
    if (path === "/api/csrf/") return Response.json({ csrfToken: `token-${++csrf}` });
    assert.equal(path, "/api/writing/sets/synthetic-set/unlock/");
    assert.equal(options.method, "POST");
    assert.equal(options.headers["X-CSRFToken"], `token-${csrf}`);
    assert.equal(options.cache, "no-store");
    assert.deepEqual(JSON.parse(options.body), {});
    return ++posts === 1 ? Response.json({ error: "csrf_failed" }, { status: 403 })
      : Response.json({ setId: "synthetic-set", unlocked: true, chargedCredits: 100, credits: { balance: 0, reserved: 0, available: 0 } });
  };
  const result = await api.unlockWriting("synthetic-set", new AbortController().signal);
  assert.equal(result.unlocked, true);
  assert.equal(result.credits.available, 0);
  assert.equal(posts, 2);
  assert.equal(calls.length, 4);
});

test("set purchase failures and quota rejections preserve their codes without automatic retries", async () => {
  for (const [status, code] of [[409, "insufficient_credits"], [403, "set_locked"], [409, "evaluation_limit_reached"], [503, "writing_unavailable"]]) {
    let posts = 0;
    globalThis.fetch = async path => {
      if (path === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
      posts++;
      return Response.json({ error: code }, { status });
    };
    const request = code === "evaluation_limit_reached" ? api.submitWriting({ id: "stable-id" }, new AbortController().signal, 45)
      : api.unlockWriting("synthetic-set", new AbortController().signal);
    await assert.rejects(request, error => error.status === status && error.code === code);
    assert.equal(posts, 1);
  }
});

test("cancelled set access never sends a purchase and an existing purchase response is accepted", async () => {
  const controller = new AbortController();
  globalThis.fetch = async path => {
    assert.equal(path, "/api/csrf/");
    controller.abort();
    return Response.json({ csrfToken: "synthetic" });
  };
  await assert.rejects(api.unlockWriting("synthetic-set", controller.signal));
  globalThis.fetch = async path => Response.json(path === "/api/csrf/" ? { csrfToken: "synthetic" }
    : { setId: "synthetic-set", unlocked: true, chargedCredits: 0, credits: { balance: 0, reserved: 0, available: 0 } });
  assert.equal((await api.unlockWriting("synthetic-set", new AbortController().signal)).chargedCredits, 0);
});

test("cancellation during CSRF acquisition prevents evaluation submission", async () => {
  const controller = new AbortController();
  const calls = [];
  globalThis.fetch = async path => {
    calls.push(path);
    controller.abort();
    return Response.json({ csrfToken: "synthetic" });
  };
  await assert.rejects(api.submitWriting({ id: "cancelled" }, controller.signal, 45));
  assert.deepEqual(calls, ["/api/csrf/"]);
});

test("missing sets and unavailable sources retain their HTTP status", async () => {
  for (const status of [404, 503]) {
    globalThis.fetch = async () => Response.json({ error: "unavailable" }, { status });
    await assert.rejects(api.writingRequest("sets/id/", new AbortController().signal), error => error.status === status);
  }
  globalThis.fetch = async () => new Response("<html>Unavailable</html>");
  await assert.rejects(api.writingRequest("sets/", new AbortController().signal));
});

test("leaving a writing page cancels the request and releases the listener", async () => {
  const controller = new AbortController();
  globalThis.fetch = async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const request = api.writingRequest("sets/", controller.signal);
  controller.abort();
  await assert.rejects(request, error => error.name === "AbortError");
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({}); };
  await assert.rejects(api.writingRequest("sets/", controller.signal));
  assert.equal(called, false);
});
