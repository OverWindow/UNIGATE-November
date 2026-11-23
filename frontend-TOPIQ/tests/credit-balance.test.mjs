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
imports["./PlanOffers"] = load("components/credits/PlanOffers.tsx");
const { default: CreditPurchase } = load("components/credits/CreditPurchase.tsx");
imports["./CreditPurchase"] = { default: CreditPurchase };
imports["./BillingContactDialog"] = load("components/credits/BillingContactDialog.tsx");
imports["./PaymentHistory"] = load("components/credits/PaymentHistory.tsx");
const { default: CreditsAccount } = load("components/credits/CreditsAccount.tsx");
const { default: PlansAccount } = load("components/credits/PlansAccount.tsx");
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
  assert.doesNotMatch(wallet.html, /결제 내역/);
  assert.deepEqual(requests.filter(call => call.url === "/api/credits/price/"), [{ url: "/api/credits/price/", method: "GET" }]);
  wallet.unmount();
  session.user = null;
  session.status = "anonymous";
  const orderId = "b73071f7-5483-40d7-b61b-3a5ecf8ae60c";
  search = new URLSearchParams({ purchase: orderId });
  const guest = mount(CreditsAccount);
  assert.doesNotMatch(guest.html, /충전 가격/);
  assert.doesNotMatch(guest.html, /결제 내역/);
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
    assert.deepEqual(calls, [["GET", `/api/credits/purchases/${id}/?product=credit`]]);
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

test("credit and Plus pages each display one shared billing notice", () => {
  const { creditsContent } = require("../src/lib/credits-content.ts");
  for (const [language, { cardIssuerNotice }] of Object.entries(creditsContent)) {
    session.language = language;
    for (const Page of [CreditsAccount, PlansAccount]) {
      const tree = mount(Page);
      assert.equal(tree.html.split(cardIssuerNotice).length - 1, 1);
      assert.match(tree.html, /class="billing-notice"[^>]*><svg/);
      tree.unmount();
    }
  }
});

test("Each Plus card lists benefits and savings and the selected purchase starts once", async () => {
  const plans = [[1, 9900], [3, 23900], [6, 43900]].map(([months, amount]) => ({
    months, amount, currency: "krw", priceId: `price_plan_${months}`, bonusCredits: 400,
  }));
  const posts = [];
  window.location = { assign() {} };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    posts.push([url, JSON.parse(options.body)]);
    return Response.json({ id: "order", status: "pending", checkoutUrl: "https://checkout.stripe.com/example" });
  };
  let buy;
  const tree = mount(() => {
    const ui = CreditPurchase({ planAccount: { plans, active: false, currentPlanMonths: null }, userId: 1, returnId: null, onFulfilled() {} });
    const [offers] = React.Children.toArray(ui.props.children);
    const controls = offers.props.renderAction(plans[2]);
    buy = React.Children.toArray(controls.props.children).find(item => item.type === "button").props.onClick;
    return ui;
  });
  const cards = tree.html.match(/<article\b[\s\S]*?<\/article>/g) ?? [];
  const free = cards.shift();
  assert.match(free, /<h2>Free<\/h2>/);
  assert.match(free, /aria-current="true"[\s\S]*?내 플랜/);
  assert.equal((tree.html.match(/내 플랜/g) ?? []).length, 1);
  assert.ok(free.includes("PBT 읽기·듣기 첫 세트 각 1개"));
  assert.ok(free.includes("IBT 읽기·듣기 첫 세트 각 1개"));
  assert.doesNotMatch(free, /<button/);
  assert.equal(cards.length, plans.length);
  for (const [index, { months, amount }] of plans.entries()) {
    const card = cards[index];
    assert.ok(card.includes(`<h2>Plus ${months}개월</h2>`));
    assert.ok(card.includes(amount.toLocaleString("ko")));
    assert.doesNotMatch(card, /개월마다/);
    assert.ok(card.includes(`aria-label="Plus ${months}개월 · 구독하기"`));
    assert.equal((card.match(/<li>/g) ?? []).length, 3);
    if (months > 1) assert.ok(card.includes(`월간 결제 대비 ${months === 3 ? 20 : 26}% 절약`));
    else assert.doesNotMatch(card, /월간 결제 대비/);
  }
  assert.doesNotMatch(tree.html, /결제 내역/);
  buy();
  buy();
  await setImmediate();
  assert.equal(posts.length, 1);
  assert.equal(posts[0][0], "/api/plans/purchases/");
  assert.deepEqual(posts[0][1], { attemptId: posts[0][1].attemptId, months: 6, priceId: "price_plan_6" });
  assert.match(posts[0][1].attemptId, /^[\da-f-]{36}$/);
  tree.unmount();
});

test("plans follow credits in the account menu without a settings link", () => {
  path = "/plans";
  const header = mount(SiteHeader);
  assert.match(header.html, /href="\/credits"[\s\S]*?href="\/plans"[\s\S]*?<span>Plus 요금제<\/span>/);
  assert.doesNotMatch(header.html, /href="\/settings"/);
  header.unmount();
  session.user = null;
  session.status = "anonymous";
  const id = crypto.randomUUID();
  search = new URLSearchParams({ purchase: id, cancelled: "1" });
  const page = mount(PlansAccount);
  assert.doesNotMatch(page.html, /<h1[^>]*>Plus<\/h1>/);
  assert.equal((page.html.match(/id="plan-card-notice"/g) ?? []).length, 1);
  assert.ok(page.html.indexOf('id="plan-card-notice"') > page.html.lastIndexOf("</article>"));
  assert.ok(page.html.includes(encodeURIComponent(`/plans?purchase=${id}&cancelled=1`)));
  assert.deepEqual(requests, []);
  page.unmount();
});

test("guests can browse all plans and each Plus card returns them to plans after login", () => {
  session.user = null;
  session.status = "anonymous";
  for (const [language, login] of [["ko", "로그인하기"], ["en", "Log in"], ["id", "Masuk"]]) {
    session.language = language;
    const page = mount(PlansAccount);
    const [free, ...offers] = page.html.match(/<article\b[\s\S]*?<\/article>/g) ?? [];
    assert.ok(free?.includes("<h2>Free</h2>"));
    assert.doesNotMatch(free, /<a\b|<button/);
    assert.equal(offers.length, 3);
    const amounts = [9900, 23900, 43900];
    for (const [index, card] of offers.entries()) {
      const price = new Intl.NumberFormat(language, { style: "currency", currency: "KRW" }).format(amounts[index]);
      assert.ok(card.includes(price));
      assert.equal((card.match(/<li>/g) ?? []).length, 3);
      assert.ok(card.includes(`href="/login?next=%2Fplans">${login}</a>`));
    }
    assert.doesNotMatch(page.html, /aria-current="true"|<button/);
    page.unmount();
  }
  assert.deepEqual(requests, []);
});

test("a subscriber can manage renewal in the portal and returns to Plus", async () => {
  const posts = [];
  window.location = { assign() {} };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    posts.push([url, JSON.parse(options.body)]);
    return Response.json({ portalUrl: "https://billing.stripe.com/p/session/fixture" });
  };
  let manage;
  const page = mount(() => {
    const ui = CreditPurchase({ userId: 1, returnId: null, planAccount: {
      plans: [1, 3, 6].map(months => ({ months, currency: "krw", amount: 9900, bonusCredits: 400 })),
      active: true, currentPlanMonths: 3, endsAt: "2026-12-15T12:00:00Z", subscription: { months: 3, state: "ending" },
    }, onFulfilled() {} });
    manage = React.Children.toArray(ui.props.children).find(el => el.type === "button").props.onClick;
    return ui;
  });
  assert.doesNotMatch(page.html, /구독하기/);
  const cards = page.html.match(/<article\b[\s\S]*?<\/article>/g);
  assert.equal(cards.filter(card => card.includes("내 플랜")).length, 1);
  assert.match(cards[2], /aria-current="true"[\s\S]*?Plus 3개월[\s\S]*?내 플랜/);
  assert.doesNotMatch(page.html, /<time|다음 결제 예정|만료 일시/);
  assert.match(page.html, /구독 관리 및 해지/);
  manage();
  await setImmediate();
  assert.deepEqual(posts, [["/api/credits/billing-portal/", { from: "plans" }]]);
  page.unmount();
});

function mountPurchaseButton() {
  let click;
  function Purchase() {
    const tree = CreditPurchase({ userId: 1, returnId: null, cancelled: false, onFulfilled: () => {} });
    const controls = React.Children.toArray(tree.props.children).flatMap(control =>
      control.type === React.Fragment ? React.Children.toArray(control.props.children) : [control]);
    click = controls.find(control => control.type === "button" && control.props.className?.includes("credits-topup-button"))?.props.onClick;
    return tree;
  }
  const tree = mount(Purchase);
  return { ...tree, click };
}

test("payment history remains available by URL without a wallet button", async () => {
  const wallet = mount(CreditsAccount);
  assert.doesNotMatch(wallet.html, /href="\/credits\?history=payments"/);
  assert.match(wallet.html, /class="credits-available"[\s\S]*class="credits-topup"/);
  wallet.unmount();
  requests.length = 0;
  search = new URLSearchParams({ history: "payments" });
  const history = mount(CreditsAccount);
  await setImmediate();
  assert.deepEqual(requests, [{ url: "/api/credits/purchases/?page=1", method: "GET" }]);
  history.unmount();
});

test("unused orders offer a full refund and each contact button selects its own order", () => {
  const { PaymentRow } = imports["./PaymentHistory"];
  const order = { id: crypto.randomUUID(), paidAt: "2026-11-21T12:00:00Z", credits: 1000, remainingCredits: 1000 };
  function row(refundState, remainingCredits) {
    return renderToStaticMarkup(React.createElement(PaymentRow, {
      order: { ...order, refundState, remainingCredits }, amount: "₩4,900", disabled: false, onRefund() {}, onContact() {},
    }));
  }
  assert.match(row("eligible", 1000), /<button[^>]*>전액 환불<\/button>/);
  const used = row("contact", 900);
  assert.match(used, /<button[^>]*aria-haspopup="dialog"[^>]*>고객 문의<\/button>/);
  assert.doesNotMatch(used, /mailto:/);
  const selected = [];
  const orderIds = [order.id, crypto.randomUUID()];
  for (const id of orderIds) {
    const rendered = PaymentRow({ order: { ...order, id, refundState: "contact" }, disabled: false, amount: "₩4,900",
      onRefund: () => assert.fail("contact must not issue a refund"), onContact: orderId => selected.push(orderId) });
    React.Children.toArray(rendered.props.children).find(child => child.type === "button").props.onClick();
  }
  assert.deepEqual(selected, orderIds);
  assert.match(row("processing", 1000), /환불 처리 중/);
  assert.doesNotMatch(row("refunded", 0), /<button/);
});

test("the billing dialog shows selectable order details and email instructions in each supported language", () => {
  const { default: BillingContactDialog } = imports["./BillingContactDialog"];
  for (const [language, copy] of [["ko", "복사"], ["en", "Copy"], ["id", "Salin"]]) {
    session.language = language;
    const id = crypto.randomUUID();
    const tree = mount(() => React.createElement(BillingContactDialog, { orderId: id, onDismiss() {} }));
    assert.match(tree.html, /<dialog[^>]*aria-labelledby=/);
    assert.ok(tree.html.includes("billing@unigate.kr") && tree.html.includes(id));
    assert.equal(tree.html.split(` · ${copy}"`).length - 1, 2);
    assert.match(tree.html, /Gmail/);
    assert.doesNotMatch(tree.html, /mailto:/);
    tree.unmount();
  }
});

test("top-up badge preserves the checkout attempt and Price ID across double clicks and retries", async t => {
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
  assert.match(first.html, /<button[^>]*class="credits-topup-button"[^>]*>충전<\/button>/);
  assert.doesNotMatch(first.html, /₩6,700|Stripe 영수증|credit-topup-price/);
  assert.doesNotMatch(first.html, /id="credit-card-notice"/);
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
