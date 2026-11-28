import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/writing/writing-practice.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { practiceTarget, practiceDifferences } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("blank answers practice the offered expression", () => {
  const correction = { original: "도와 주십시요", suggestion: "도와주십시오" };
  for (const slot of [51, 52]) {
    assert.deepEqual(practiceTarget(slot, { a: "꼭 도와 주십시요.", b: "내일" }, correction),
      { original: correction.original, expected: correction.suggestion });
  }
});

test("an essay uses the surrounding sentence and applies only the selected correction", () => {
  const text = "첫째 문장이다.\r\n  이용률이 3.5% 늘어 났다. 다음 문장이다.";
  for (const slot of [53, 54]) {
    assert.deepEqual(practiceTarget(slot, { text }, { original: "늘어 났다", suggestion: "늘어났다." }),
      { original: "이용률이 3.5% 늘어 났다.", expected: "이용률이 3.5% 늘어났다." });
  }
  assert.deepEqual(practiceTarget(54, { text: "집에서 책을 읽고 또 음악을 듣는다." }, { original: "집에서", suggestion: "도서관에서" }),
    { original: "집에서 책을 읽고 또 음악을 듣는다.", expected: "도서관에서 책을 읽고 또 음악을 듣는다." });
});

test("missing answers, repeated or overlapping matches, and cross-sentence edits keep the expression", () => {
  for (const [answer, original] of [
    [undefined, "보았다"],
    [{ text: "말을 들었다." }, "보았다"],
    [{ text: "말을 보았다. 새를 보았다." }, "보았다"],
    [{ text: "가가가." }, "가가"],
    [{ text: "말을 보았다. 새가 날았다." }, "보았다. 새가"],
  ]) {
    assert.deepEqual(practiceTarget(54, answer, { original, suggestion: "관찰했다" }),
      { original, expected: "관찰했다" });
  }
});

test("checking composes Hangul and normalizes line endings and outer whitespace", () => {
  assert.deepEqual(practiceDifferences(" 한글\r\n연습.\r\n", "한글\n연습.".normalize("NFD")),
    [{ kind: "equal", text: "한글\n연습." }]);
  assert.deepEqual(practiceDifferences("", "   "), []);
});

test("separate spacing and punctuation errors retain the matching words", () => {
  assert.deepEqual(practiceDifferences("책을 읽고 싶다.", "책을읽고 싶다!!"), [
    { kind: "equal", text: "책을" }, { kind: "missing", text: " " },
    { kind: "equal", text: "읽고 싶다" }, { kind: "missing", text: "." }, { kind: "extra", text: "!!" },
  ]);
  assert.deepEqual(practiceDifferences("한😀글", "한글"), [
    { kind: "equal", text: "한" }, { kind: "missing", text: "😀" }, { kind: "equal", text: "글" },
  ]);
});

test("unexpectedly large input preserves the matching ends and both complete values", () => {
  const expected = "시작" + "가".repeat(2000) + "끝";
  const typed = "시작" + "나".repeat(5000) + "끝";
  const groups = practiceDifferences(expected, typed);
  assert.deepEqual(groups.map(({ kind }) => kind), ["equal", "missing", "extra", "equal"]);
  assert.equal(groups.filter(group => group.kind !== "extra").map(group => group.text).join(""), expected);
  assert.equal(groups.filter(group => group.kind !== "missing").map(group => group.text).join(""), typed);
});
