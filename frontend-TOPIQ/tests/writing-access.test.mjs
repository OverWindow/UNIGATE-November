import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const dataUrl = code => `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
async function compile(path, imports = {}) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  let code = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  for (const [name, url] of Object.entries(imports)) code = code.replaceAll(JSON.stringify(name), JSON.stringify(url));
  return dataUrl(code);
}

const contextUrl = dataUrl(`let state;
export const setSession = next => { state = next; };
export const useApp = () => state;
export const usePathname = () => state.path;`);
const { setSession } = await import(contextUrl);
const copyUrl = await compile("../src/lib/writing/writing-content.ts");
const { writingContent } = await import(copyUrl);
const { default: WritingAccess } = await import(await compile("../src/components/writing/WritingAccess.tsx", {
  "react/jsx-runtime": pathToFileURL(require.resolve("react/jsx-runtime")).href,
  "next/link": dataUrl(`import { createElement } from ${JSON.stringify(reactUrl)};
    export default function Link({children, ...props}) { return createElement("a", props, children); }`),
  "next/navigation": contextUrl,
  "lucide-react": dataUrl("export const Lock = () => null;"),
  "@/app/providers": contextUrl,
  "@/lib/writing/writing-content": copyUrl,
}));

function render(path, changes = {}) {
  setSession({ path, language: "ko", user: null, status: "anonymous", refreshSession() {}, ...changes });
  return renderToStaticMarkup(createElement(WritingAccess, null, createElement("span", null, "PAGE_CONTENT")));
}

test("the writing catalog is public even while session detection is loading or unavailable", () => {
  for (const path of ["/writing", "/writing/"]) {
    for (const status of ["anonymous", "loading", "error"]) {
      assert.ok(render(path, { status }).includes("PAGE_CONTENT"));
    }
  }
});

test("guest set pages show a localized lock and sign-in return link without rendering the questions", () => {
  const path = "/writing/sets/00000000-0000-0000-0000-000000000001";
  for (const language of ["ko", "en", "id"]) {
    const html = render(path, { language });
    assert.ok(!html.includes("PAGE_CONTENT"));
    assert.ok(html.includes(writingContent[language].lockedTitle));
    assert.ok(html.includes(writingContent[language].loginRequired));
    assert.ok(html.includes(`/login?next=${encodeURIComponent(path)}`));
  }
});

test("evaluation history and unresolved private sessions stay behind the login gate", () => {
  for (const path of ["/writing/history", "/writing/history/synthetic-id", "/writing/sets/synthetic-id"]) {
    assert.ok(!render(path).includes("PAGE_CONTENT"));
    for (const status of ["loading", "error"]) {
      assert.ok(!render(path, { status }).includes("PAGE_CONTENT"));
    }
    assert.ok(render(path, { user: { id: 1 }, status: "authenticated" }).includes("PAGE_CONTENT"));
  }
});

test("purchase explanations do not advertise an evaluation count in any supported language", () => {
  for (const language of ["ko", "en", "id"]) {
    assert.ok(!/20|\{limit\}/.test(writingContent[language].unlockNote));
  }
});
