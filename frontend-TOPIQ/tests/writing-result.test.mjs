import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/writing-result.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { correctionSegments, visibleReviewReasons, writingScoreLimits } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("display score limits match the backend rubrics for each question", async () => {
  const rubrics = JSON.parse(await readFile(new URL("../../backend/writing/rubrics.json", import.meta.url), "utf8"));
  for (const slot of [51, 52, 53, 54]) assert.deepEqual(writingScoreLimits[slot], rubrics[slot].max_scores);
});

test("correction locations preserve the whole original, including emoji and whitespace", () => {
  const text = "😀  기술이 발달했다.\r\n그러나 어려움이 있다.  ";
  const segments = correctionSegments(text, [{ original: "기술이 발달했다." }]);
  assert.equal(segments.map(segment => segment.text).join(""), text);
  assert.deepEqual(segments.filter(segment => segment.corrections.length), [{ text: "기술이 발달했다.", corrections: [0] }]);
});

test("repeated quotes and overlapping suggestions remain linked without losing text", () => {
  const text = "필요가 있다. 도움이 필요가 있다.";
  const segments = correctionSegments(text, [{ original: "필요가 있다" }, { original: "도움이 필요가 있다" }]);
  assert.equal(segments.map(segment => segment.text).join(""), text);
  assert.deepEqual(segments.filter(segment => segment.corrections.length), [
    { text: "필요가 있다", corrections: [0] },
    { text: "도움이 ", corrections: [1] },
    { text: "필요가 있다", corrections: [0, 1] },
  ]);
});

test("empty or unmatched quotes do not mark unrelated answers", () => {
  for (const corrections of [[], [{ original: "" }], [{ original: " " }], [{ original: "다른 빈칸의 답안" }]]) {
    assert.deepEqual(correctionSegments("원문 그대로", corrections), [{ text: "원문 그대로", corrections: [] }]);
  }
  assert.deepEqual(correctionSegments("", [{ original: "없는 문장" }]), []);
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
