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

test("delivery errors retain committed feedback, field errors and resend delay", async () => {
  globalThis.fetch = async path => path === "/api/csrf/" ? json({ csrfToken: "synthetic" }) : json({
    error: "result_email_rate_limited", fields: ["email"], feedback: { completed: true }, retryAfter: 60,
  }, 429);
  await assert.rejects(api.pbtRequest("attempts/test/result-email/", "POST", {}, "ibt"), error => {
    assert.equal(error.code, "result_email_rate_limited");
    assert.deepEqual(error.fields, ["email"]);
    assert.equal(error.feedback.completed, true);
    assert.equal(error.retryAfter, 60);
    return true;
  });
});

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

test("IBT writes use the IBT endpoint and current CSRF token", async () => {
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") return json({ csrfToken: "synthetic-ibt" });
    assert.equal(path, "/api/ibt/attempts/test/answers/30/");
    assert.equal(options.method, "PUT");
    assert.equal(options.headers["X-CSRFToken"], "synthetic-ibt");
    assert.deepEqual(JSON.parse(options.body), { selectedOption: 4 });
    return json({ selectedOption: 4 });
  };
  await api.pbtRequest("attempts/test/answers/30/", "PUT", { selectedOption: 4 }, "ibt");
});

test("IBT groups use snapshot IDs; ordinary repeated types stay separate", () => {
  const items = [
    { position: 13, itemType: "ibt_main_idea", groupId: null },
    { position: 14, itemType: "ibt_main_idea", groupId: null },
    { position: 15, itemType: "ibt_idea_content", groupId: "ibt-listening-15" },
    { position: 16, itemType: "ibt_idea_content", groupId: "ibt-listening-15" },
    { position: 17, itemType: "ibt_idea_content", groupId: "ibt-listening-17" },
    { position: 18, itemType: "ibt_idea_content", groupId: "ibt-listening-17" },
  ];
  assert.deepEqual(api.questionGroup(items, items[1]).map(i => i.position), [14]);
  assert.deepEqual(api.questionGroup(items, items[3]).map(i => i.position), [15, 16]);
  assert.deepEqual(api.questionGroup(items, items[4]).map(i => i.position), [17, 18]);
  const legacy = [{ position: 49, itemType: "paired_reading" }, { position: 50, itemType: "paired_reading" }];
  assert.deepEqual(api.questionGroup(legacy, legacy[1]), legacy);
});
