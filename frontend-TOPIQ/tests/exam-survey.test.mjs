import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const catalog = JSON.parse(await readFile(new URL("../src/lib/survey-catalog.json", import.meta.url), "utf8"));
const source = (await readFile(new URL("../src/lib/exam-survey.ts", import.meta.url), "utf8"))
  .replace('import catalog from "./survey-catalog.json";', `const catalog = ${JSON.stringify(catalog)};`);
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const { surveyErrors, emptySurvey, surveyCopy, currentSurveyYear } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const valid = () => ({ ...emptySurvey(), nationalityCode: "ID", birthYear: 2000, topikReasons: ["employment"],
  koreanStudyDuration: "1_to_2_years", topikExperience: "none", targetTopikLevel: 4, privacyConsent: true });

test("empty survey requires answers and explicit consent; valid survey permits no prior level", () => {
  assert.ok(surveyErrors(emptySurvey()).includes("privacyConsent"));
  assert.deepEqual(surveyErrors(valid()), []);
});
test("other reason and experienced learner's level are conditionally required", () => {
  assert.ok(surveyErrors({ ...valid(), topikReasons: ["other"] }).includes("topikReasonOther"));
  assert.ok(surveyErrors({ ...valid(), topikExperience: "once" }).includes("currentTopikLevel"));
  assert.deepEqual(surveyErrors({ ...valid(), topikExperience: "once", currentTopikLevel: 0 }), []);
});
test("invalid options, duplicates, future years and out of range levels are rejected", () => {
  for (const change of [{ nationalityCode: "XX" }, { birthYear: currentSurveyYear() + 1 }, { targetTopikLevel: 2 },
    { targetTopikLevel: 3.5 }, { topikReasons: ["employment", "employment"] }, { privacyConsentVersion: "old" }]) {
    assert.ok(surveyErrors({ ...valid(), ...change }).length);
  }
});
test("survey copy and selectable choices cover all three languages", () => {
  for (const language of ["ko", "en", "id"]) {
    assert.deepEqual(Object.keys(surveyCopy[language]), Object.keys(surveyCopy.ko));
    assert.ok(Object.values(surveyCopy[language]).every(value => typeof value === "string" && value.trim()));
  }
  for (const list of [catalog.reasons, catalog.studyDurations, catalog.experiences]) {
    assert.ok(list.every(row => row.length === 4 && row.every(value => value.length)));
  }
});
