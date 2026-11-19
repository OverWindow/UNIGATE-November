import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
async function compile(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  let code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(JSON.stringify(name), JSON.stringify(url));
  return dataUrl(code);
}

const contextUrl = dataUrl(`let language = "ko";
export const setLanguage = value => { language = value; };
export const useApp = () => ({ language });`);
const context = await import(contextUrl);
const { default: WritingResult } = await import(await compile("../src/components/writing/WritingResult.tsx", {
  "react": pathToFileURL(require.resolve("react")).href,
  "react/jsx-runtime": pathToFileURL(require.resolve("react/jsx-runtime")).href,
  "lucide-react": dataUrl("export const ChevronDown = () => null;"),
  "@/app/providers": contextUrl,
  "@/lib/writing/writing-evaluation-content": await compile("../src/lib/writing/writing-evaluation-content.ts"),
  "@/lib/writing/writing-result": await compile("../src/lib/writing/writing-result.ts"),
}));

function entry(feedbackLanguage) {
  return { typeSlot: 53, status: "succeeded", feedbackLanguage, result: {
    summary: "Saved feedback", review_reasons: ["Saved review"],
    scores: { content: { score: 5, rationale: "Saved rationale", quotes: ["한국어 원문"] } },
    task_checks: [{ requirement_id: "a", status: "부분 충족", reason: "Saved reason", quotes: ["한국어 원문"] }],
    corrections: [{ original: "한국어 원문", suggestion: "한국어 수정문", reason: "Saved correction reason" }],
  } };
}

function render(value) {
  return renderToStaticMarkup(createElement(WritingResult, {
    entry: value, correctionId: "correction", activeCorrection: null, correctionsOpen: true, onToggleCorrections() {},
  }));
}

test("all three languages translate score and task labels while preserving Korean text", () => {
  for (const [language, score, status] of [
    ["ko", "내용 및 수행 과제", "부분 충족"],
    ["en", "Content and task fulfillment", "Partially met"],
    ["id", "Isi dan pemenuhan tugas", "Sebagian terpenuhi"],
  ]) {
    context.setLanguage(language);
    const html = render(entry(language));
    assert.ok(html.includes(`<div lang="${language}"><p class="writing-result-summary">Saved feedback</p>`));
    assert.ok(html.includes(`<h4 lang="${language}">${score}</h4>`));
    assert.ok(html.includes(`data-status="부분 충족">${status}</span>`));
    assert.ok(html.includes('<blockquote lang="ko">한국어 원문</blockquote>'));
    assert.ok(html.includes('<p lang="ko"><del>한국어 원문</del></p>'));
    assert.ok(html.includes('<p lang="ko"><ins>한국어 수정문</ins></p>'));
    assert.ok(html.includes("Saved correction reason"));
  }
});

test("changing the page language preserves saved feedback and legacy Korean language tags", () => {
  context.setLanguage("id");
  const saved = entry("en");
  const original = structuredClone(saved);
  assert.ok(render(saved).includes('<div lang="en"><p class="writing-result-summary">Saved feedback</p>'));
  assert.deepEqual(saved, original);
  delete saved.feedbackLanguage;
  assert.ok(render(saved).includes('<div lang="ko"><p class="writing-result-summary">Saved feedback</p>'));
});
