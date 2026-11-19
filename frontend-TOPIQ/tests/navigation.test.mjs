import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { announceNavigation, isPageDestination, navigationStartEvent } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("only same-origin path or query changes trigger the navigation overlay", () => {
  assert.equal(isPageDestination("https://topiq.test/pbt?round=1", "https://topiq.test/writing"), true);
  assert.equal(isPageDestination("https://topiq.test/vocabulary?level=4", "https://topiq.test/vocabulary?level=5"), true);
  assert.equal(isPageDestination("https://topiq.test/pbt#one", "https://topiq.test/pbt#two"), false);
  assert.equal(isPageDestination("https://topiq.test/pbt", "https://topiq.test/pbt"), false);
  assert.equal(isPageDestination("https://topiq.test/pbt", "https://example.com/pbt"), false);
});

test("programmatic navigation emits the shared start event", () => {
  const originalWindow = globalThis.window;
  let emitted = 0;
  globalThis.window = { dispatchEvent(event) {
    assert.equal(event.type, navigationStartEvent);
    emitted += 1;
  } };
  try {
    announceNavigation();
    assert.equal(emitted, 1);
  } finally { globalThis.window = originalWindow; }
});
