import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/timed-exit.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { guardTimedExit } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const original = Object.fromEntries(["window", "document", "Element", "HTMLAnchorElement"].map(key => [key, globalThis[key]]));
afterEach(() => { for (const [key, value] of Object.entries(original)) globalThis[key] = value; });

function setup() {
  const examUrl = "http://localhost/pbt/attempts/test";
  const state = { active: true, exits: 0, restores: 0, pending: null, assigned: null };
  const win = new EventTarget();
  const doc = new EventTarget();
  win.location = { href: examUrl, assign: value => { state.assigned = value; } };
  const entries = [{ url: "http://localhost/pbt", state: {} }, { url: examUrl, state: { __NA: true } }];
  let index = 1;
  win.history = {
    get length() { return entries.length; },
    get state() { return entries[index].state; },
    pushState(value, _, url) { entries.splice(index + 1); entries.push({ url, state: value }); index++; win.location.href = url; },
    go(delta) { index += delta; win.location.href = entries[index].url; win.dispatchEvent(new Event("popstate")); },
  };
  class Element {}
  class Anchor extends Element {
    constructor(href) { super(); this.href = href; this.target = ""; }
    closest() { return this; }
    hasAttribute() { return false; }
  }
  Object.assign(globalThis, { window: win, document: doc, Element, HTMLAnchorElement: Anchor });
  const cleanup = guardTimedExit({ id: "test", fallback: "/pbt", isActive: () => state.active,
    requestExit: leave => { state.pending = leave; },
    pageExit: () => { if (state.active) { state.active = false; state.exits++; } },
    restore: () => { state.restores++; },
  });
  function click(href, changes = {}) {
    const event = Object.assign(new Event("click", { cancelable: true }), { button: 0, ...changes });
    Object.defineProperty(event, "target", { value: new Anchor(href) });
    doc.dispatchEvent(event);
    return event;
  }
  return { win, doc, state, cleanup, click, examUrl };
}

test("leaving links wait for confirmation while same-page and new-tab clicks remain available", () => {
  const { state, click, examUrl, cleanup } = setup();
  assert.equal(click(examUrl + "#main-content").defaultPrevented, false);
  assert.equal(click("http://localhost/ibt", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(state.pending, null);
  assert.equal(click("http://localhost/ibt").defaultPrevented, true);
  assert.equal(state.exits, 0);
  assert.equal(state.assigned, null);
  state.active = false;
  state.pending();
  assert.equal(state.assigned, "http://localhost/ibt");
  cleanup();
  assert.equal(state.exits, 0);
});

test("back stays on the exam until confirmed, then returns to the preceding page", () => {
  const { win, state, examUrl, cleanup } = setup();
  win.history.go(-1);
  assert.equal(win.location.href, examUrl);
  assert.equal(state.exits, 0);
  state.active = false;
  state.pending();
  assert.equal(win.location.href, "http://localhost/pbt");
  cleanup();
});

test("refresh warning and backgrounding do not submit; actual page exit submits once", () => {
  const { win, doc, state, cleanup } = setup();
  const warning = new Event("beforeunload", { cancelable: true });
  win.dispatchEvent(warning);
  assert.equal(warning.defaultPrevented, true);
  assert.equal(state.exits, 0);
  doc.dispatchEvent(new Event("visibilitychange"));
  assert.equal(state.exits, 0);
  win.dispatchEvent(new Event("pagehide"));
  assert.equal(state.exits, 1);
  win.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }));
  assert.equal(state.restores, 1);
  cleanup();
  assert.equal(state.exits, 1);
});

test("jumping back multiple entries keeps the exam router state until exit is confirmed", () => {
  const { win, state, examUrl, cleanup } = setup();
  win.history.go(-2);
  assert.equal(win.location.href, examUrl);
  assert.equal(win.history.state.__NA, true);
  state.active = false;
  state.pending();
  assert.equal(win.location.href, "http://localhost/pbt");
  cleanup();
});
