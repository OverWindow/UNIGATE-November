import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import ts from "typescript";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
const source = await readFile(new URL("../src/lib/pbt-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const api = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test("practice never expires; timed deadline comes from server time", () => {
  assert.equal(api.remainingSeconds({ expiresAt: null, serverNow: "2026-11-03T00:00:00Z" }, 900000000), null);
  const attempt = { serverNow: "2026-11-03T00:00:00Z", expiresAt: "2026-11-03T01:00:00Z" };
  assert.equal(api.remainingSeconds(attempt, 0), 3600);
  assert.equal(api.remainingSeconds(attempt, 60000), 3540);
  assert.equal(api.remainingSeconds(attempt, 3600001), 0);
  assert.equal(api.clockText(4200), "70:00");
});

test("answer writes use current CSRF and preserve null to clear an answer", async () => {
  globalThis.fetch = async (path, options) => {
    assert.equal(options.credentials, "same-origin");
    if (path === "/api/csrf/") return json({ csrfToken: "synthetic" });
    assert.equal(path, "/api/pbt/attempts/test/answers/1/");
    assert.equal(options.method, "PUT");
    assert.equal(options.headers["X-CSRFToken"], "synthetic");
    assert.deepEqual(JSON.parse(options.body), { selectedOption: null });
    return json({ selectedOption: null });
  };
  assert.deepEqual(await api.pbtRequest("attempts/test/answers/1/", "PUT", { selectedOption: null }), { selectedOption: null });
});

test("expired answer saves and guest restrictions are not treated as success", async () => {
  for (const [status, code] of [[409, "attempt_closed"], [403, "login_required"], [503, "pbt_unavailable"]]) {
    globalThis.fetch = async path => path === "/api/csrf/" ? json({ csrfToken: "synthetic" }) : json({ error: code }, status);
    await assert.rejects(api.pbtRequest("attempts/test/answers/1/", "PUT", { selectedOption: 2 }), error => error.code === code && error.status === status);
  }
});
