import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

async function load(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}
const { moveSentence } = await load("../src/lib/sentence-order.ts");
const { isAnswered, answerText } = await load("../src/lib/pbt-api.ts");

test("place, swap, replace and return sentences without duplication or losing the original state", () => {
  const empty = [null, null, null, null];
  const placed = moveSentence(empty, "나", 0);
  assert.deepEqual(empty, [null, null, null, null]);
  assert.deepEqual(placed, ["나", null, null, null]);
  const two = moveSentence(placed, "가", 2);
  assert.deepEqual(moveSentence(two, "나", 2), ["가", null, "나", null]);
  assert.deepEqual(moveSentence(two, "라", 2), ["나", null, "라", null]);
  assert.deepEqual(moveSentence(two, "나", null), [null, null, "가", null]);
  assert.deepEqual(moveSentence(two, "나", 0), two);
  assert.deepEqual(moveSentence(two, "나", 3), [null, null, "가", "나"]);
});

test("only a complete arrangement counts as answered, including orders outside the old choices", () => {
  const question = { answerMode: "sentence_order", selectedOption: null };
  assert.ok(!isAnswered(question));
  assert.ok(!isAnswered({ ...question, selectedOrder: ["가", null, "라", null] }));
  assert.ok(isAnswered({ ...question, selectedOrder: ["다", "가", "나", "라"] }));
  assert.equal(answerText({ ...question, selectedOrder: ["가", null, "라", null] }), "가 → — → 라 → —");
  assert.ok(isAnswered({ selectedOption: 2 }));
  assert.ok(!isAnswered({ selectedOption: null }));
});
