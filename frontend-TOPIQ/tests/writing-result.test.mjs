import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/writing-result.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { correctionSegments, toggleCorrection, writingTaskLabel, visibleReviewReasons, writingScoreLimits } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("display score limits match the backend rubrics for each question", async () => {
  const rubrics = JSON.parse(await readFile(new URL("../../backend/writing/rubrics.json", import.meta.url), "utf8"));
  for (const slot of [51, 52, 53, 54]) assert.deepEqual(writingScoreLimits[slot], rubrics[slot].max_scores);
});

test("correction locations preserve the whole original, including emoji and whitespace", () => {
  const text = "😀  기술이 발달했다.\r\n그러나 어려움이 있다.  ";
  const segments = correctionSegments(text, [{ original: "기술이 발달했다." }]);
  assert.equal(segments.map(segment => segment.text).join(""), text);
  assert.deepEqual(segments.filter(segment => segment.corrections.length).map(segment => segment.text), ["기술이 발달했다."]);
  assert.equal(segments.flatMap(segment => segment.corrections)[0].start, text.indexOf("기술이 발달했다."));
});

test("repeated quotes and overlapping suggestions remain linked without losing text", () => {
  const text = "필요가 있다. 도움이 필요가 있다.";
  const segments = correctionSegments(text, [{ original: "필요가 있다" }, { original: "도움이 필요가 있다" }]);
  assert.equal(segments.map(segment => segment.text).join(""), text);
  assert.deepEqual(segments.filter(segment => segment.corrections.length).map(segment => ({text: segment.text, indices: segment.corrections.map(match => match.index)})), [
    { text: "필요가 있다", indices: [0] },
    { text: "도움이 필요가 있다", indices: [1, 0] },
  ]);
});

test("empty or unmatched quotes do not mark unrelated answers", () => {
  for (const corrections of [[], [{ original: "" }], [{ original: " " }], [{ original: "다른 빈칸의 답안" }]]) {
    assert.deepEqual(correctionSegments("원문 그대로", corrections), [{ start: 0, text: "원문 그대로", corrections: [] }]);
  }
  assert.deepEqual(correctionSegments("", [{ original: "없는 문장" }]), []);
});

test("each repeated occurrence can be applied and undone without changing original whitespace or other edits", () => {
  const text = "😀  편하다.\r\n매우 편하다.  ";
  const corrections = Object.freeze([Object.freeze({original: "편하다.", suggestion: "시간과 장소의 제약이 없다."})]);
  const matches = correctionSegments(text, corrections).flatMap(segment => segment.corrections);
  const render = applied => correctionSegments(text, corrections, applied).map(segment => segment.text).join("");
  let applied = toggleCorrection([], matches[0]);
  assert.equal(render(applied), "😀  시간과 장소의 제약이 없다.\r\n매우 편하다.  ");
  applied = toggleCorrection(applied, matches[1]);
  assert.equal(render(applied), "😀  시간과 장소의 제약이 없다.\r\n매우 시간과 장소의 제약이 없다.  ");
  applied = toggleCorrection(applied, matches[0]);
  assert.equal(render(applied), "😀  편하다.\r\n매우 시간과 장소의 제약이 없다.  ");
  assert.equal(render(toggleCorrection(applied, matches[1])), text);
  assert.equal(render([]), text);
});

test("overlapping suggestions replace each other while independent edits remain intact", () => {
  const text = "도움이 필요가 있다. 다시 필요가 있다.";
  const corrections = [{ original: "필요가 있다", suggestion: "필요하다" }, { original: "도움이 필요가 있다", suggestion: "도움이 요구된다" }];
  const matches = correctionSegments(text, corrections).flatMap(segment => segment.corrections);
  const outer = matches.find(match => match.index === 1);
  const inner = matches.find(match => match.index === 0);
  const last = matches.at(-1);
  const render = applied => correctionSegments(text, corrections, applied).map(segment => segment.text).join("");
  const firstEdits = toggleCorrection(toggleCorrection([], inner), last);
  assert.equal(render(firstEdits), "도움이 필요하다. 다시 필요하다.");
  const outerEdits = toggleCorrection(firstEdits, outer);
  assert.equal(render(outerEdits), "도움이 요구된다. 다시 필요하다.");
  assert.equal(render(firstEdits), "도움이 필요하다. 다시 필요하다.");
  assert.equal(render(toggleCorrection(outerEdits, outer)), "도움이 필요가 있다. 다시 필요하다.");
  assert.equal(render(toggleCorrection(outerEdits, inner)), "도움이 필요하다. 다시 필요하다.");
});

test("adjacent corrections and replacement text containing the original do not cascade", () => {
  const corrections = [{ original: "가", suggestion: "가나다" }, { original: "나", suggestion: "나다" }];
  const matches = correctionSegments("가나", corrections).flatMap(segment => segment.corrections);
  let applied = matches.reduce((edits, match) => toggleCorrection(edits, match), []);
  assert.equal(correctionSegments("가나", corrections, applied).map(segment => segment.text).join(""), "가나다나다");
  applied = matches.reduce((edits, match) => toggleCorrection(edits, match), applied);
  assert.equal(correctionSegments("가나", corrections, applied).map(segment => segment.text).join(""), "가나");
});

test("task labels resolve the exact saved requirement, material or note", () => {
  const question = {requirements: ["첫 번째 요구", "두 번째 요구"], materials: [{title: "온라인 학습 이용률"}], material_notes: ["증가 원인 설명"]};
  assert.equal(writingTaskLabel("a", undefined), "㉠의 문맥·의미·문법·격식");
  assert.equal(writingTaskLabel("b", undefined), "㉡의 문맥·의미·문법·격식");
  assert.equal(writingTaskLabel("requirement:2", question), "두 번째 요구");
  assert.equal(writingTaskLabel("material:1", question), "자료의 정보와 관계: 온라인 학습 이용률");
  assert.equal(writingTaskLabel("note:1", question), "증가 원인 설명");
  for (const id of ["requirement:0", "requirement:3", "unknown", "note:-1"]) assert.equal(writingTaskLabel(id, question), undefined);
  assert.equal(writingTaskLabel("note:1", undefined), undefined);
});

test("generic partial-score notices are hidden while concrete review reasons remain", () => {
  const notice = "빈칸별 세부 부분점수 기준이 제공되지 않아 0~5점 평가는 실험적 추정입니다.";
  const concrete = "㉠은 요청 의도가 모호하므로 문맥을 다시 확인해야 합니다.";
  assert.deepEqual(visibleReviewReasons([
    notice,
    "출처에 세부 부분점수 기준이 제공되지 않아 빈칸 점수는 실험적 추정임.",
    concrete,
    "자료의 수치가 서로 달라 검토가 필요합니다.",
  ]), [concrete, "자료의 수치가 서로 달라 검토가 필요합니다."]);
  assert.deepEqual(visibleReviewReasons([`${notice} ${concrete}`]), [concrete]);
  assert.deepEqual(visibleReviewReasons([`${concrete}\n${notice}`]), [concrete]);
  assert.deepEqual(visibleReviewReasons(["모의 응답이며 실제 채점 결과가 아님."]), ["모의 응답이며 실제 채점 결과가 아님."]);
});
