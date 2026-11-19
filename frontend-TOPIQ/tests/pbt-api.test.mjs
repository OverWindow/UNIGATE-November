import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, beforeEach, test } from "node:test";
import ts from "typescript";
import { setCsrfToken } from "../src/lib/csrf.ts";

const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });
beforeEach(() => setCsrfToken(null));
const source = await readFile(new URL("../src/lib/exam/pbt-api.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const code = compiled.replace('"../csrf"', JSON.stringify(new URL("../src/lib/csrf.ts", import.meta.url).href));
const api = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
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
  const writes = [];
  for (const [status, code] of [[409, "attempt_closed"], [403, "login_required"], [503, "pbt_unavailable"]]) {
    globalThis.fetch = async path => {
      if (path === "/api/csrf/") return json({ csrfToken: "synthetic" });
      writes.push(code);
      return json({ error: code }, status);
    };
    await assert.rejects(api.pbtRequest("attempts/test/answers/1/", "PUT", { selectedOption: 2 }), error => error.code === code && error.status === status);
  }
  assert.deepEqual(writes, ["attempt_closed", "login_required", "pbt_unavailable"]);
});

for (const [format, count] of [["pbt", 50], ["ibt", 30]]) {
  test(`${format}: one request per answer after entering the exam`, async () => {
    const calls = [];
    globalThis.fetch = async (path, options) => {
      calls.push(path);
      if (path === "/api/csrf/") return json({ csrfToken: "exam-token" });
      if (options.method === "GET") assert.equal(options.headers["X-CSRFToken"], undefined);
      else assert.equal(options.headers["X-CSRFToken"], "exam-token");
      return json({});
    };
    await api.pbtRequest("exams/", "GET", undefined, format);
    await api.pbtRequest("attempts/test/enter/", "POST", { sessionToken: "page" }, format);
    const base = `/api/${format}/attempts/test/`;
    assert.deepEqual(calls, [`/api/${format}/exams/`, "/api/csrf/", base + "enter/"]);
    calls.length = 0;
    for (let position = 1; position <= count; position++) {
      await api.pbtRequest(`attempts/test/answers/${position}/`, "PUT", { selectedOption: 2 }, format);
    }
    assert.deepEqual(calls, Array.from({ length: count }, (_, i) => `${base}answers/${i + 1}/`));
  });
}

test("concurrent writes share one token lookup", async () => {
  const lookup = Promise.withResolvers();
  let lookups = 0;
  const writes = [];
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") {
      lookups++;
      return lookup.promise;
    }
    writes.push(options.headers["X-CSRFToken"]);
    return json({});
  };
  const first = api.pbtRequest("attempts/a/enter/", "POST", {});
  const second = api.pbtRequest("attempts/b/enter/", "POST", {});
  lookup.resolve(json({ csrfToken: "shared" }));
  await Promise.all([first, second]);
  assert.equal(lookups, 1);
  assert.deepEqual(writes, ["shared", "shared"]);
});

test("a CSRF rejection refreshes once and resends the same timed answer", async () => {
  setCsrfToken("old");
  let lookups = 0;
  const tokens = [];
  globalThis.fetch = async (path, options) => {
    if (path === "/api/csrf/") {
      lookups++;
      return json({ csrfToken: "new" });
    }
    assert.equal(path, "/api/ibt/attempts/test/answers/2/");
    assert.equal(options.method, "PUT");
    assert.equal(options.headers["X-Exam-Session"], "page");
    assert.deepEqual(JSON.parse(options.body), { selectedOption: null });
    tokens.push(options.headers["X-CSRFToken"]);
    return tokens.length === 1 ? json({ error: "csrf_failed" }, 403) : json({ selectedOption: null });
  };
  assert.deepEqual(await api.pbtRequest("attempts/test/answers/2/", "PUT", { selectedOption: null }, "ibt", "page"), { selectedOption: null });
  assert.deepEqual(tokens, ["old", "new"]);
  assert.equal(lookups, 1);
});

test("a second CSRF rejection stops, and a network failure does not resend a write", async () => {
  setCsrfToken("old");
  let lookups = 0;
  let writes = 0;
  let offline = false;
  globalThis.fetch = async path => {
    if (path === "/api/csrf/") return json({ csrfToken: `token-${++lookups}` });
    writes++;
    if (offline) throw new TypeError("offline");
    return json({ error: "csrf_failed" }, 403);
  };
  const submit = () => api.pbtRequest("attempts/test/submit/", "POST", {});
  await assert.rejects(submit(), error => error instanceof api.PbtError && error.code === "csrf_failed");
  assert.equal(lookups, 1);
  assert.equal(writes, 2);
  offline = true;
  await assert.rejects(submit(), error => error instanceof api.PbtError && error.code === "network_error");
  assert.equal(writes, 3);
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

test("timed answer writes include the current page session and exit uses keepalive with cached CSRF", async () => {
  const calls = [];
  globalThis.fetch = async (path, options) => {
    calls.push({ path, options });
    return path === "/api/csrf/" ? json({ csrfToken: "synthetic-exit" }) : json({ status: "submitted" });
  };
  await api.pbtRequest("attempts/test/answers/1/", "PUT", { selectedOption: 2 }, "ibt", "page-session");
  assert.equal(calls[1].options.headers["X-Exam-Session"], "page-session");
  api.submitOnPageExit("test", "ibt");
  assert.equal(calls.length, 3);
  assert.equal(calls[2].path, "/api/ibt/attempts/test/submit/");
  assert.equal(calls[2].options.keepalive, true);
  assert.equal(calls[2].options.credentials, "same-origin");
  assert.equal(calls[2].options.headers["X-CSRFToken"], "synthetic-exit");
});
