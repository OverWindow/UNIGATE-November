import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/writing/writing-manuscript.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { layoutManuscript, manuscriptPosition, manuscriptOffsetAt } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const cellText = cell => cell?.parts.map(part => part.text).join("") ?? "";

test("paper starts at 300 or 700 cells and grows without truncating the answer", () => {
  assert.equal(layoutManuscript("", 300).cells.length, 300);
  assert.equal(layoutManuscript("", 700).cells.length, 700);
  const text = "가".repeat(1000);
  const layout = layoutManuscript(text, 300);
  assert.equal(layout.cells.map(cellText).join(""), text);
  assert.ok(layout.cells.length > 1000);
  assert.equal(manuscriptPosition(layout, text.length), 1001);
});

test("indentation preserves explicit spaces and maps paragraphs to original offsets", () => {
  const text = "첫 문단\r\n\n 둘째 문단  ";
  const layout = layoutManuscript(text, 300);
  assert.equal(cellText(layout.cells[1]), "첫");
  assert.equal(cellText(layout.cells[50]), " ");
  assert.equal(cellText(layout.cells[51]), "둘");
  for (const cell of layout.cells.filter(Boolean)) {
    for (const part of cell.parts) assert.equal(text.slice(part.start, part.end), part.text);
  }
  assert.equal(manuscriptPosition(layout, 6), 26);
  assert.equal(manuscriptPosition(layout, 7), 50);
  assert.equal(manuscriptOffsetAt(layout, 2, 1), 8);
  assert.equal(cellText(layoutManuscript("  글", 300).cells[2]), "글");
});

test("ASCII pairs have individually addressable cursor positions", () => {
  const layout = layoutManuscript("2023년 TOPIK", 300);
  assert.deepEqual(layout.cells.slice(1, 8).map(cellText), ["20", "23", "년", " ", "TO", "PI", "K"]);
  assert.equal(manuscriptPosition(layout, 1), 1.5);
  assert.equal(manuscriptOffsetAt(layout, 0, 1.5), 1);
  assert.equal(manuscriptOffsetAt(layout, 0, 2), 2);
});

test("combining Hangul and emoji are kept intact with UTF-16 selection offsets", () => {
  const text = "한👩‍💻끝";
  const layout = layoutManuscript(text, 300);
  assert.deepEqual(layout.cells.slice(1, 4).map(cellText), ["한", "👩‍💻", "끝"]);
  assert.equal(manuscriptOffsetAt(layout, 0, 2), 3);
  assert.equal(manuscriptOffsetAt(layout, 0, 3), 8);
});

test("closing punctuation stays with the last cell and opening punctuation moves with the following text", () => {
  const closing = layoutManuscript("가".repeat(24) + ".다", 300);
  assert.equal(cellText(closing.cells[24]), "가.");
  assert.equal(cellText(closing.cells[25]), "다");
  assert.equal(manuscriptOffsetAt(closing, 0, 24.5), 24);
  assert.equal(manuscriptOffsetAt(closing, 0, 25), 25);
  const opening = layoutManuscript("가".repeat(23) + "(나)", 300);
  assert.equal(cellText(opening.cells[24]), "");
  assert.equal(cellText(opening.cells[25]), "(");
  assert.equal(manuscriptOffsetAt(opening, 0, 25), 23);
});

test("an explicit newline after a full row does not insert an extra blank row", () => {
  const layout = layoutManuscript("가".repeat(24) + "\n나", 300);
  assert.equal(cellText(layout.cells[26]), "나");
  assert.equal(manuscriptOffsetAt(layout, 1, 1), 25);
  assert.equal(manuscriptOffsetAt(layout, 10, 10), 26);
});
