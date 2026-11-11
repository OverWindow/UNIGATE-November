import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { after, test } from "node:test";
import { Garu } from "garu-ko/node";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/vocabulary-analysis.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { segmentExample, exampleVersion, createExampleAnalyzer } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const garu = await Garu.load();
after(() => garu.destroy());

test("real Garu code-point spans preserve emoji, whitespace and API selections", () => {
  const text = "😀 친구가\n친구를  도왔어요!";
  const result = segmentExample(text, garu.analyze(text).tokens);
  assert.equal(result.map(s => s.text).join(""), text);
  assert.deepEqual(result.filter(s => s.candidates.length).map(s => [s.start, s.end, s.candidates]),
    [[2, 5, [["친구", 1]]], [6, 9, [["친구", 1]]], [11, 15, [["돕다", 5]]]]);
  assert.ok(result.filter(s => !/^[\p{L}\p{N}_]/u.test(s.text)).every(s => !s.candidates.length));
});

test("real Garu suffixes form dictionary lemmas without making punctuation clickable", () => {
  const text = "공부했다. 아름다운 꽃!";
  const tokens = garu.analyze(text).tokens;
  const original = structuredClone(tokens);
  const result = segmentExample(text, tokens);
  assert.deepEqual(tokens, original);
  assert.deepEqual(result.filter(s => s.candidates.length).map(s => [s.text, s.candidates]),
    [["공부했다", [["공부하다", 5]]], ["아름다운", [["아름답다", 6]]], ["꽃", [["꽃", 1]]]]);
});

test("particles and endings are excluded; candidates are deduplicated and capped at three", () => {
  const tokens = [
    ["공부하", "VV"], ["공부하", "VV"], ["공부", "NNG"], ["친구", "NNG"], ["시간", "NNG"], ["었", "EP"], ["다", "EF"],
  ].map(([text, pos]) => ({ text, pos, start: 0, end: 5 }));
  const result = segmentExample("공부했다.", tokens);
  assert.deepEqual(result[0].candidates, [["공부하다", 5], ["공부", 1], ["친구", 1]]);
  assert.deepEqual(result[1].candidates, []);
});

test("version hashes match the backend UTF-8 contract and change with the example", async () => {
  const text = "😀 친구가 사과를 먹었어요.";
  assert.equal(await exampleVersion(text), createHash("sha256").update(`4:garu-0.13.0:segments=1\0${text}`).digest("hex"));
  assert.notEqual(await exampleVersion(text), await exampleVersion(text + " "));
});

test("non-Korean text and cancellation never load the model", async () => {
  const analyzer = createExampleAnalyzer();
  assert.deepEqual((await analyzer.analyze("😀 hello!", new AbortController().signal)).segments.map(s => s.candidates), [[], [], []]);
  await assert.rejects(analyzer.analyze("먹었어요", AbortSignal.abort()), { name: "AbortError" });
  await assert.rejects(analyzer.analyze("가".repeat(2001), new AbortController().signal), /example_unavailable/);
  analyzer.dispose();
  await assert.rejects(analyzer.analyze("먹었어요", new AbortController().signal), { name: "AbortError" });
});

test("closing the example during hashing prevents initialization", async () => {
  const analyzer = createExampleAnalyzer();
  const controller = new AbortController();
  const request = analyzer.analyze("친구가 사과를 먹었어요.", controller.signal);
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
  analyzer.dispose();
});
