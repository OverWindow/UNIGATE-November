import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { afterEach, test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/modal-motion.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { closeWithMotion } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const originalWindow = globalThis.window;
afterEach(() => { globalThis.window = originalWindow; });

test("modal stays mounted until its closing animation finishes", async () => {
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const element = {
    dataset: {},
    animate: () => ({ finished }),
    removeAttribute(name) { if (name === "data-closing") delete this.dataset.closing; },
  };
  globalThis.window = { matchMedia: () => ({ matches: false }) };
  let closed = false;
  closeWithMotion(element, () => { closed = true; });
  assert.equal(closed, false);
  assert.equal(element.dataset.closing, "true");
  finish();
  await finished;
  await Promise.resolve();
  assert.equal(closed, true);
  assert.equal(element.dataset.closing, undefined);
});

test("reduced motion closes immediately", () => {
  globalThis.window = { matchMedia: () => ({ matches: true }) };
  let closed = false;
  closeWithMotion({ animate: () => { throw new Error("animation should be skipped"); } }, () => { closed = true; });
  assert.equal(closed, true);
});
