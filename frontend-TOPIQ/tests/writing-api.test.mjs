import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import ts from "typescript";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const source = await readFile(new URL("../src/lib/writing-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("writing only reads prompts, without creating an attempt or requesting CSRF", async () => {
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
