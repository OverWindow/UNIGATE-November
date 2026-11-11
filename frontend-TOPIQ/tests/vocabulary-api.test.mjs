import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import ts from "typescript";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const source = await readFile(new URL("../src/lib/vocabulary-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("vocabulary reads do not create learning progress or fetch a CSRF token", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push(path);
    assert.equal(options.method, "GET");
    assert.equal(options.body, undefined);
    assert.equal(options.cache, "no-store");
    return Response.json({ sets: [] });
  };
  assert.deepEqual(await api.vocabularyRequest("sets/?level=4&page=2"), { sets: [] });
  assert.deepEqual(calls, ["/api/vocabulary/sets/?level=4&page=2"]);
});

test("missing sets, unavailable sources and invalid JSON are not successful empty catalogs", async () => {
  for (const [status, error] of [[404, "not_found"], [503, "vocabulary_unavailable"]]) {
    globalThis.fetch = async () => Response.json({ error }, { status });
    await assert.rejects(api.vocabularyRequest("sets/1/"), cause => cause.status === status && cause.code === error);
  }
  globalThis.fetch = async () => new Response("<html>Proxy unavailable</html>", { status: 502 });
  await assert.rejects(api.vocabularyRequest("sets/1/"), cause => cause.status === 502 && cause.code === "server_error");
  globalThis.fetch = async () => { throw new TypeError("Network failure"); };
  await assert.rejects(api.vocabularyRequest("levels/"), cause => cause.code === "network_error");
});

test("catalog URLs preserve valid levels and pages and reject malformed selections", () => {
  assert.deepEqual(api.catalogSelection(new URLSearchParams("level=6&page=4")), { level: 6, page: 4 });
  for (const query of ["", "level=2&page=0", "level=3.5&page=-1", "level=3x&page=1e3", "level=&page=99999999999999"]) {
    assert.deepEqual(api.catalogSelection(new URLSearchParams(query)), { level: 3, page: 1 });
  }
});

test("quiz checks fetch fresh CSRF and send only the chosen answer and question version", async () => {
  const calls = [];
  const body = { selectedOption: 3, version: "2026-11-11T01:00:00+00:00" };
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return Response.json(path === "/api/csrf/" ? { csrfToken: "synthetic" } : { isCorrect: false });
  };
  assert.deepEqual(await api.vocabularyRequest("sets/1/questions/2/check/", undefined, body), { isCorrect: false });
  assert.deepEqual(calls.map(call => call.path), ["/api/csrf/", "/api/vocabulary/sets/1/questions/2/check/"]);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.headers["X-CSRFToken"], "synthetic");
  assert.equal(calls[1].options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(calls[1].options.body), body);
  assert.ok(calls.every(call => call.options.credentials === "same-origin" && call.options.cache === "no-store"));
});

test("quiz checks preserve stale-question errors and never submit without valid CSRF", async () => {
  globalThis.fetch = async path => Response.json(path === "/api/csrf/" ? { csrfToken: "synthetic" }
    : { error: "question_changed" }, { status: path === "/api/csrf/" ? 200 : 409 });
  await assert.rejects(api.vocabularyRequest("sets/1/questions/2/check/", undefined, { selectedOption: 1, version: "old" }),
    error => error.code === "question_changed" && error.status === 409);
  for (const payload of [{}, { csrfToken: 3 }, null]) {
    const calls = [];
    globalThis.fetch = async path => { calls.push(path); return Response.json(payload); };
    await assert.rejects(api.vocabularyRequest("sets/1/questions/2/check/", undefined, {}), error => error.code === "server_error");
    assert.deepEqual(calls, ["/api/csrf/"]);
  }
});

test("leaving during CSRF acquisition prevents quiz submission", async () => {
  const controller = new AbortController();
  const calls = [];
  globalThis.fetch = async path => {
    calls.push(path);
    controller.abort();
    return Response.json({ csrfToken: "synthetic" });
  };
  await assert.rejects(api.vocabularyRequest("sets/1/questions/2/check/", controller.signal, {}), { name: "AbortError" });
  assert.deepEqual(calls, ["/api/csrf/"]);
});

test("a screen signal cancels both catalog requests", async () => {
  const controller = new AbortController();
  const signals = [];
  globalThis.fetch = (_path, { signal }) => new Promise((_resolve, reject) => {
    signals.push(signal);
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
  const requests = ["levels/", "sets/?level=3&page=1"].map(path => api.vocabularyRequest(path, controller.signal));
  const cancelled = Promise.all(requests.map(request => assert.rejects(request, { name: "AbortError" })));
  controller.abort();
  await cancelled;
  assert.equal(signals.length, 2);
  assert.ok(signals.every(signal => signal.aborted));
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("an already cancelled request does not start fetching or a timer", async t => {
  const controller = new AbortController();
  controller.abort();
  globalThis.fetch = () => assert.fail("A cancelled request must not fetch");
  const timer = t.mock.method(globalThis, "setTimeout");
  await assert.rejects(api.vocabularyRequest("sets/1/", controller.signal), { name: "AbortError" });
  assert.equal(timer.mock.callCount(), 0);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
});

test("cancellation and the 15-second deadline cover fetching and reading JSON", async t => {
  for (const phase of ["fetch", "body"]) {
    for (const reason of ["navigation", "timeout"]) {
      await t.test(`${phase}: ${reason}`, async t => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const controller = new AbortController();
        let requestSignal;
        let markStarted;
        const started = new Promise(resolve => { markStarted = resolve; });
        globalThis.fetch = async (_path, { signal }) => {
          requestSignal = signal;
          const waitForAbort = () => new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () => reject(signal.reason), { once: true });
            markStarted();
          });
          return phase === "fetch" ? waitForAbort() : { ok: true, status: 200, json: waitForAbort };
        };
        const request = api.vocabularyRequest("sets/1/", controller.signal);
        const rejected = assert.rejects(request, error => reason === "navigation"
          ? error.name === "AbortError"
          : error instanceof api.VocabularyError && error.code === "network_error");
        await started;
        if (reason === "navigation") {
          controller.abort();
        } else {
          t.mock.timers.tick(14999);
          assert.equal(requestSignal.aborted, false);
          t.mock.timers.tick(1);
        }
        await rejected;
        assert.equal(requestSignal.aborted, true);
        assert.equal(getEventListeners(controller.signal, "abort").length, 0);
      });
    }
  }
});

test("completed and failed requests clear their deadline and caller listener", async t => {
  for (const status of [200, 503]) {
    await t.test(`status ${status}`, async t => {
      t.mock.timers.enable({ apis: ["setTimeout"] });
      const controller = new AbortController();
      const clearTimer = t.mock.method(globalThis, "clearTimeout");
      let requestSignal;
      globalThis.fetch = async (_path, { signal }) => {
        requestSignal = signal;
        return Response.json(status === 200 ? { sets: [] } : { error: "vocabulary_unavailable" }, { status });
      };
      const request = api.vocabularyRequest("sets/?level=3&page=1", controller.signal);
      if (status === 200) await request;
      else await assert.rejects(request, error => error.status === 503);
      assert.equal(clearTimer.mock.callCount(), 1);
      assert.equal(getEventListeners(controller.signal, "abort").length, 0);
      controller.abort();
      t.mock.timers.tick(15000);
      assert.equal(requestSignal.aborted, false);
    });
  }
});
