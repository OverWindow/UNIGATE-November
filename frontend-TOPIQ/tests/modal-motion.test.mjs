import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/modal-motion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { closeWithMotion } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });

test("modal closes after the animation and clears the transparent frame before it can reopen", async () => {
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  let closed = false;
  let released = false;
  const element = {
    dataset: {},
    animate: () => ({ finished, cancel() { assert.equal(closed, true); released = true; } }),
    removeAttribute(name) { if (name === "data-closing") delete this.dataset.closing; },
  };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  closeWithMotion(element, () => { closed = true; });
  assert.equal(closed, false);
  assert.equal(element.dataset.closing, "true");
  finish();
  await finished;
  await Promise.resolve();
  assert.equal(closed, true);
  assert.equal(released, true);
  assert.equal(element.dataset.closing, undefined);
});

test("reduced motion closes immediately", () => {
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  let closed = false;
  closeWithMotion({ animate: () => { throw new Error("animation should be skipped"); } }, () => { closed = true; });
  assert.equal(closed, true);
});
