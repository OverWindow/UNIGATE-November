import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/ibt-listening.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const timing = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const storage = new Map();
Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
} });
after(() => {
  if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
  else delete globalThis.sessionStorage;
});

test("one question gets 13 seconds; a shared passage with two gets 20", () => {
  assert.equal(timing.solvingSeconds(1), 13);
  assert.equal(timing.solvingSeconds(2), 20);
});

test("deadlines count real elapsed time, including a suspended tab; practice is unlimited", () => {
  const start = 100_000;
  assert.equal(timing.phaseSeconds(start + 3000, start), 3);
  assert.equal(timing.phaseSeconds(start + 3000, start + 1001), 2);
  assert.equal(timing.phaseSeconds(start + 13_000, start + 12_999), 1);
  assert.equal(timing.phaseSeconds(start + 20_000, start + 65_000), 0);
  assert.equal(timing.phaseSeconds(null, start + 3600_000), null);
  assert.equal(timing.listeningClock(153), "00:02:33");
});

test("refresh preserves the passage, audio position and original solve deadline", () => {
  const value = { position: 15, phase: "solving", deadline: 120_000, elapsed: 90, duration: 90, volume: .4 };
  timing.saveListeningCheckpoint("resume", value);
  const saved = timing.readListeningCheckpoint("resume");
  assert.deepEqual(saved, value);
  assert.equal(timing.phaseSeconds(saved.deadline, 115_000), 5);
  assert.equal(timing.phaseSeconds(saved.deadline, 125_000), 0);
  assert.equal(timing.readListeningCheckpoint("another-attempt"), null);
});

test("invalid persisted timing cannot create an endless timed phase", () => {
  const value = { position: 1, phase: "solving", deadline: null, elapsed: 0, duration: 2, volume: 1 };
  for (const [index, bad] of [value, { ...value, phase: "unknown" }, { ...value, position: 99 }, { ...value, volume: -1 }].entries()) {
    storage.set(`topiq:ibt:listening:bad-${index}`, JSON.stringify(bad));
    assert.equal(timing.readListeningCheckpoint(`bad-${index}`), null);
  }
});
