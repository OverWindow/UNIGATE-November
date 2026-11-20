import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { compileFunction } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const originalFetch = globalThis.fetch;
const balance = { available: 73, balance: 83, reserved: 10 };
const price = { priceId: "price_test_topiq", amount: 6700, currency: "krw", credits: 1000 };
let path, session, requests, effects, search;

// Render actual component trees and run their mount effects without a browser.
const imports = {
  react: { ...React, useEffect: setup => effects.push(setup) },
  "next/navigation": { usePathname: () => path, useSearchParams: () => search },
  "next/image": { default: () => null },
  "next/link": { default: ({ href, children }) => React.createElement("a", { href }, children) },
  "@/app/providers": { useApp: () => session },
  "@/lib/use-navigation-router": { default: () => ({}) },
};
function load(relativePath) {
  const source = readFileSync(new URL(`../src/${relativePath}`, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } });
  const exports = {};
  compileFunction(outputText, ["exports", "require"])(exports, name => {
    if (name in imports) return imports[name];
    if (name.startsWith("@/lib/")) return require(`../src/${name.slice(2)}.ts`);
    return require(name);
  });
  return exports;
}
const writingApi = load("lib/writing/writing-api.ts");
imports["@/lib/writing/writing-api"] = writingApi;
const { default: SiteHeader } = load("components/SiteHeader.tsx");
const { default: CreditPurchase } = load("components/credits/CreditPurchase.tsx");
imports["./CreditPurchase"] = { default: CreditPurchase };
const { default: CreditsAccount } = load("components/credits/CreditsAccount.tsx");
const { default: WritingCreditBadge } = load("components/writing/WritingCreditBadge.tsx");

function mount(...components) {
  const html = renderToStaticMarkup(React.createElement(React.Fragment, null,
    ...components.map(component => React.createElement(component, {}))));
  const cleanups = effects.splice(0).map(setup => setup());
  return { html, unmount: () => cleanups.forEach(cleanup => cleanup?.()) };
}

beforeEach(() => {
  effects = [];
  search = new URLSearchParams();
  requests = [];
  globalThis.window = new EventTarget();
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method });
    if (url === "/api/credits/price/") return Response.json(price);
    return Response.json(url === "/api/credits/" ? balance : { transactions: [], nextPage: null });
  };
  session = { user: { id: 1 }, status: "authenticated", language: "ko", creditBalance: balance,
    refreshCredits: signal => writingApi.creditsRequest("", signal) };
});
afterEach(() => { delete globalThis.window; globalThis.fetch = originalFetch; });

test("only signed-in users request the price; returning guests keep their order when signing in", () => {
  const wallet = mount(CreditsAccount);
  assert.match(wallet.html, /충전 가격을 불러오는 중/);
  assert.deepEqual(requests.filter(call => call.url === "/api/credits/price/"), [{ url: "/api/credits/price/", method: "GET" }]);
  wallet.unmount();
  session.user = null;
  session.status = "anonymous";
  const orderId = "b73071f7-5483-40d7-b61b-3a5ecf8ae60c";
  search = new URLSearchParams({ purchase: orderId });
  const guest = mount(CreditsAccount);
  assert.doesNotMatch(guest.html, /충전 가격/);
  assert.equal(requests.filter(call => call.url === "/api/credits/price/").length, 1);
  assert.ok(guest.html.includes(encodeURIComponent(`/credits?purchase=${orderId}`)));
  guest.unmount();
});

test("a return from Checkout checks the order before refreshing the wallet, even on a cancel return", async () => {
  const id = "b73071f7-5483-40d7-b61b-3a5ecf8ae60c";
  for (const status of ["pending", "fulfilled", "expired"]) {
    const calls = [];
    globalThis.fetch = async (url, options) => {
      if (url === "/api/credits/price/") return Response.json({}, { status: 503 });
      calls.push([options.method, url]);
      return Response.json({ id, status });
    };
    let refreshes = 0;
    const tree = mount(() => React.createElement(CreditPurchase, {
      userId: 1, returnId: id, cancelled: true, onFulfilled: () => refreshes++,
    }));
    await setImmediate();
    assert.deepEqual(calls, [["GET", `/api/credits/purchases/${id}/`]]);
    assert.equal(refreshes, status === "fulfilled" ? 1 : 0);
    tree.unmount();
  }
});

function savedCheckout(t, attemptId) {
  const key = "topiq-credit-purchase:1";
  const storage = new Map([[key, JSON.stringify({ attemptId, price })]]);
  const originalStorage = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key),
  } });
  t.after(() => {
    if (originalStorage) Object.defineProperty(globalThis, "sessionStorage", originalStorage);
    else delete globalThis.sessionStorage;
  });
  return storage;
}

function mountPurchaseButton() {
  let click;
  function Purchase() {
    const tree = CreditPurchase({ userId: 1, returnId: null, cancelled: false, onFulfilled: () => {} });
    click = React.Children.toArray(tree.props.children)[0].props.onClick;
    return tree;
  }
  const tree = mount(Purchase);
  return { ...tree, click };
}

test("resumed checkout displays the original amount and double clicks or retries keep its attempt and Price ID", async t => {
  const attemptId = "10c9b4ea-f68f-44c2-bb79-4bf13d951ab2";
  savedCheckout(t, attemptId);
  const attempts = [], redirects = [];
  window.location = { assign: url => redirects.push(url) };
  let loseResponse;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    attempts.push(JSON.parse(options.body));
    if (attempts.length === 1) return new Promise((_, reject) => { loseResponse = reject; });
    return Response.json({ id: "order", status: "pending", checkoutUrl: "https://checkout.stripe.com/example" });
  };
  const first = mountPurchaseButton();
  assert.match(first.html, /1,000크레딧 충전 · 6,700원/);
  first.click();
  first.click();
  await setImmediate();
  assert.equal(attempts.length, 1);
  loseResponse(new TypeError("network error"));
  await setImmediate();
  first.unmount();
  const retry = mountPurchaseButton();
  retry.click();
  await setImmediate();
  assert.deepEqual(attempts, [{ attemptId, priceId: price.priceId }, { attemptId, priceId: price.priceId }]);
  assert.deepEqual(redirects, ["https://checkout.stripe.com/example"]);
  retry.unmount();
});

test("a quote conflict clears the saved attempt without submitting a replacement order", async t => {
  const storage = savedCheckout(t, crypto.randomUUID());
  let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    if (url === "/api/credits/price/") return Response.json({ ...price, priceId: "price_updated", amount: 7100 });
    assert.equal(JSON.parse(options.body).priceId, price.priceId);
    posts++;
    return Response.json({ error: "price_changed" }, { status: 409 });
  };
  const first = mountPurchaseButton();
  first.click();
  await setImmediate();
  assert.equal(storage.size, 0);
  first.unmount();
  const refreshed = mountPurchaseButton();
  assert.match(refreshed.html, /충전 가격을 불러오는 중/);
  assert.equal(posts, 1);
  refreshed.unmount();
});

test("the header makes no balance request; the wallet reads one balance followed by its ledger", async () => {
  path = "/pbt";
  const exam = mount(SiteHeader);
  window.dispatchEvent(new Event("focus"));
  assert.deepEqual(requests, []);
  exam.unmount();

  path = "/credits";
  const wallet = mount(SiteHeader, CreditsAccount);
  await setImmediate();
  assert.deepEqual(requests, [
    { url: "/api/credits/", method: "GET" },
    { url: "/api/credits/price/", method: "GET" },
    { url: "/api/credits/transactions/?page=1", method: "GET" },
  ]);
  wallet.unmount();
});

test("the visible writing badge refreshes on mount and focus, and aborts on leaving", () => {
  for (path of ["/writing", "/writing/sets/example"]) {
    const signals = [];
    session.refreshCredits = signal => { signals.push(signal); return writingApi.creditsRequest("", signal); };
    const badge = mount(SiteHeader, WritingCreditBadge);
    assert.match(badge.html, /<strong>73<\/strong>/);
    assert.equal(signals.length, 1);
    window.dispatchEvent(new Event("focus"));
    assert.equal(signals.length, 2);
    badge.unmount();
    assert.ok(signals.every(signal => signal.aborted));
    window.dispatchEvent(new Event("focus"));
    assert.equal(signals.length, 2);
  }
});

test("hidden history badges and unauthenticated writing pages do not request a balance", () => {
  for (const [pathname, status] of [["/writing/history", "authenticated"], ["/writing/history/example", "authenticated"],
    ["/writing", "loading"], ["/writing", "anonymous"]]) {
    path = pathname;
    session.status = status;
    if (status === "anonymous") session.user = null;
    const badge = mount(WritingCreditBadge);
    assert.equal(badge.html, "");
    window.dispatchEvent(new Event("focus"));
    badge.unmount();
  }
  assert.deepEqual(requests, []);
});
