import assert from "node:assert/strict";
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
