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
let path, session, requests, effects, search, plansDialog;

// Render actual component trees and run their mount effects without a browser.
const imports = {
  react: {
    ...React,
    useEffect: setup => effects.push(setup),
    useRef: value => React.useRef(value === null && plansDialog ? plansDialog : value),
  },
  "next/navigation": { usePathname: () => path, useSearchParams: () => search, useRouter: () => ({}) },
  "next/image": { default: () => null },
  "next/link": { default: ({ href, children, "data-plans-checkout": checkout }) => React.createElement("a", { "data-plans-checkout": checkout, href }, children) },
  "@/app/providers": { useApp: () => session },
  "@/lib/seo": { requestLanguage: async () => session.language },
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
imports["./PlanChangeControls"] = load("components/credits/PlanChangeControls.tsx");
imports["@/components/credits/PlanChangeControls"] = imports["./PlanChangeControls"];
imports["./TrialConsent"] = load("components/credits/TrialConsent.tsx");
const { default: CreditPurchase } = load("components/credits/CreditPurchase.tsx");
imports["./CreditPurchase"] = { default: CreditPurchase };
imports["./BillingContactDialog"] = load("components/credits/BillingContactDialog.tsx");
imports["./PaymentHistory"] = load("components/credits/PaymentHistory.tsx");
const { default: RefundSettings } = load("components/credits/RefundSettings.tsx");
imports["./CopyEmailAddress"] = load("app/settings/contact/CopyEmailAddress.tsx");
const { default: ContactPage } = load("app/settings/contact/page.tsx");
const { default: SubscriptionSettings, SubscriptionSummary } = load("app/settings/subscription/SubscriptionSettings.tsx");
imports["../csrf"] = require("../src/lib/csrf.ts");
imports["@/lib/exam/pbt-api"] = load("lib/exam/pbt-api.ts");
const { default: ExamHistory } = load("app/settings/exam-history/ExamHistory.tsx");
const { default: SettingsPage } = load("app/settings/page.tsx");
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
  plansDialog = null;
  search = new URLSearchParams();
  requests = [];
  globalThis.window = new EventTarget();
  window.location = { href: "https://topiq.example/plans" };
  window.history = { state: null, pushState(state) { this.state = state; } };
  globalThis.document = new EventTarget();
  globalThis.fetch = async (url, options) => {
    requests.push({ url, method: options.method });
    if (url === "/api/credits/price/") return Response.json(price);
    return Response.json(url === "/api/credits/" ? balance : { transactions: [], nextPage: null });
  };
  session = { user: { id: 1 }, status: "authenticated", language: "ko", setLanguage() {}, creditBalance: balance,
    refreshCredits: signal => writingApi.creditsRequest("", signal) };
});
afterEach(() => { delete globalThis.document; delete globalThis.window; globalThis.fetch = originalFetch; });

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

test("returning from card setup or Plus Checkout checks the order silently", async () => {
  const id = crypto.randomUUID();
  for (const language of ["ko", "en", "id"]) {
    session.language = language;
    for (const trial of [undefined, { status: "awaiting_card" }]) {
      const calls = [];
      globalThis.fetch = async url => {
        calls.push(url);
        return Response.json({ id, status: "pending", trial });
      };
      const page = mount(() => React.createElement(CreditPurchase, {
        userId: 1, returnId: id, cancelled: true, planAccount: null, onPlanRefresh() {},
        onFulfilled: () => assert.fail("An incomplete order should remain pending"),
      }));
      await setImmediate();
      assert.doesNotMatch(page.html, /role="status"/);
      assert.deepEqual(calls, [`/api/credits/purchases/${id}/?product=plan`]);
      page.unmount();
    }
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
    months, amount, currency: "krw", priceId: `price_plan_${months}`, bonusCredits: 400, trialDays: months === 1 ? 7 : 0,
  }));
  const posts = [];
  const checkoutSteps = [];
  window.location = { assign(url) { checkoutSteps.push(url); } };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    posts.push([url, JSON.parse(options.body)]);
    return Response.json({ id: "order", status: "pending", checkoutUrl: "https://checkout.stripe.com/example" });
  };
  let buy;
  const tree = mount(() => {
    const ui = CreditPurchase({ planAccount: { plans, active: false, currentPlanMonths: null, trialEligible: true }, userId: 1, returnId: null, onFulfilled() {},
      onCheckout() { checkoutSteps.push("checkout"); } });
    const [offers] = React.Children.toArray(ui.props.children);
    buy = offers.props.renderAction(plans[2]).props.onClick;
    return ui;
  });
  const cards = tree.html.match(/<article\b[\s\S]*?<\/article>/g) ?? [];
  const free = cards.shift();
  assert.doesNotMatch(tree.html, /내 구독|구독 관리 및 해지/);
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
    assert.ok(card.includes(`aria-label="Plus ${months}개월 · ${months === 1 ? "7일 무료 체험 시작" : "결제하고 시작"}"`));
    assert.ok(card.includes(months === 1 ? "카드 등록 후 결제 없이 사용 시작, 7일 뒤 자동 결제" : "지금 바로 결제 후 사용 시작"));
    assert.ok(card.includes("모든 모의고사 및 단어장 무제한 열람"));
    assert.ok(card.includes(months === 1 ? "button button-primary" : "button plan-pay-button"));
    assert.equal((card.match(/<li>/g) ?? []).length, 3);
    if (months > 1) assert.ok(card.includes(`월간 결제 대비 ${months === 3 ? 20 : 26}% 절약`));
    else assert.doesNotMatch(card, /월간 결제 대비/);
  }
  assert.doesNotMatch(tree.html, /결제 내역/);
  buy();
  buy();
  await setImmediate();
  assert.equal(posts.length, 1);
  assert.deepEqual(checkoutSteps, ["checkout", "https://checkout.stripe.com/example"]);
  assert.equal(posts[0][0], "/api/plans/purchases/");
  assert.deepEqual(posts[0][1], { attemptId: posts[0][1].attemptId, months: 6, priceId: "price_plan_6" });
  assert.match(posts[0][1].attemptId, /^[\da-f-]{36}$/);
  tree.unmount();
});

test("settings follows plans in the account menu", () => {
  path = "/plans";
  const header = mount(SiteHeader);
  assert.match(header.html, /href="\/credits"[\s\S]*?href="\/plans"[\s\S]*?<span>Plus 요금제<\/span>/);
  assert.match(header.html, /href="\/plans"[\s\S]*href="\/settings"[\s\S]*<span>설정<\/span>/);
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
  const { plansContent } = require("../src/lib/plans-content.ts");
  for (const language of ["ko", "en", "id"]) {
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
      const prefix = language === "ko" ? "" : `/${language}`;
      const label = index === 0 ? plansContent[language].trial.start : plansContent[language].trial.pay;
      assert.ok(card.includes(`href="${prefix}/login?next=${encodeURIComponent(prefix + "/plans")}">${label}</a>`));
    }
    assert.doesNotMatch(page.html, /aria-current="true"/);
    assert.doesNotMatch(page.html, /plans-close/);
    assert.equal((page.html.match(/data-plans-checkout=/g) ?? []).length, offers.length);
    assert.ok(page.html.includes(plansContent[language].exit.title));
    page.unmount();
  }
  assert.deepEqual(requests, []);
});

test("going back from the public plans page waits for confirmation", () => {
  session.user = null;
  session.status = "anonymous";
  let opened = 0;
  plansDialog = { showModal() { opened++; }, focus() {} };
  const page = mount(PlansAccount);
  assert.equal(window.history.state.topiqPlansExit, true);

  window.history.state = null;
  window.dispatchEvent(new Event("popstate"));
  assert.equal(opened, 1);
  assert.equal(window.history.state.topiqPlansExit, true);
  assert.equal(window.dispatchEvent(new Event("beforeunload", { cancelable: true })), false);
  page.unmount();
  assert.equal(window.dispatchEvent(new Event("beforeunload", { cancelable: true })), true);
});

test("Plus links subscribers to their separate settings page below the offers", () => {
  const page = mount(() => React.createElement(CreditPurchase, { userId: 1, returnId: null, planAccount: {
      plans: [1, 3, 6].map(months => ({ months, currency: "krw", amount: 9900, bonusCredits: 400 })),
      active: true, currentPlanMonths: 3, endsAt: "2026-12-15T12:00:00Z", subscription: { months: 3, state: "ending" },
    }, onFulfilled() {} }));
  assert.doesNotMatch(page.html, /구독하기/);
  const cards = page.html.match(/<article\b[\s\S]*?<\/article>/g);
  assert.equal(cards.filter(card => card.includes("내 플랜")).length, 1);
  assert.match(cards[2], /aria-current="true"[\s\S]*?Plus 3개월[\s\S]*?내 플랜/);
  assert.doesNotMatch(page.html, /내 구독|<time|다음 결제 예정|만료 일시/);
  assert.ok(page.html.slice(page.html.lastIndexOf("</article>")).includes('href="/settings/subscription">구독 관리'));
  page.unmount();
});

test("monthly rejoining starts a paid checkout while eligible accounts require a trial offer", async () => {
  const { publicPlans } = require("../src/lib/plans-content.ts");
  const posts = [];
  window.location.assign = () => {};
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    posts.push([url, JSON.parse(options.body)]);
    return Response.json({ id: "order", status: "pending", checkoutUrl: "https://checkout.stripe.com/example" });
  };
  for (const [trialEligible, trialDays] of [[false, 0], [true, undefined]]) {
    const plans = publicPlans.map(offer => ({ ...offer, priceId: "price-" + offer.months, trialDays: offer.months === 1 ? trialDays : 0 }));
    let button;
    const page = mount(() => {
      const ui = CreditPurchase({ userId: 1, planAccount: { plans, active: false, trialEligible } });
      const [offers] = React.Children.toArray(ui.props.children);
      button = offers.props.renderAction(plans[0]);
      return ui;
    });
    const [, monthly, quarterly, semiannual] = page.html.match(/<article\b[\s\S]*?<\/article>/g);
    assert.equal(button.props.disabled, trialEligible);
    if (!trialEligible) {
      assert.match(monthly, /₩9,900/);
      assert.match(monthly, /button-primary[^>]+>결제하고 시작/);
      assert.doesNotMatch(monthly, /7일 동안 0원/);
      button.props.onClick();
      await setImmediate();
    }
    for (const term of [quarterly, semiannual]) assert.doesNotMatch(term, /<button[^>]*disabled/);
    page.unmount();
  }
  assert.equal(posts.length, 1);
  assert.equal(posts[0][0], "/api/plans/purchases/");
  assert.deepEqual(posts[0][1], { attemptId: posts[0][1].attemptId, priceId: "price-1", months: 1, offer: "monthly_paid" });
});

test("trial consent is explicit and shows the quoted instant, amount, payment method and cancellation terms in every language", () => {
  const { plansContent, billingTime, planAmount } = require("../src/lib/plans-content.ts");
  const quote = { endsAt: "2099-09-20T01:45:16Z", consentVersion: "v1", priceId: "price-monthly", amount: 9900, currency: "krw" };
  for (const language of ["ko", "en", "id"]) {
    session.language = language;
    const page = mount(() => React.createElement(imports["./TrialConsent"].default, { quote, busy: false, onConfirm() {} }));
    assert.ok(page.html.includes(billingTime(language, quote.endsAt)));
    assert.ok(page.html.includes(planAmount(language, quote.amount)));
    assert.ok(page.html.includes(plansContent[language].trial.card));
    assert.ok(page.html.includes(plansContent[language].trial.cancel));
    assert.match(page.html, /type="checkbox"[^>]*required/);
    assert.doesNotMatch(page.html, /type="checkbox"[^>]*checked/);
    assert.match(page.html, /type="submit"[^>]*disabled/);
    page.unmount();
  }
});

test("trial subscribers see their first charge or scheduled cancellation until the same access deadline", () => {
  const trialEndsAt = "2099-09-20T01:45:16Z";
  for (const state of ["trialing", "ending"]) {
    const account = { active: true, endsAt: trialEndsAt, trialEndsAt, firstChargeAmount: 9900, currentPlanMonths: 1,
      subscription: { state, months: 1 }, canOpenBillingPortal: true };
    const page = mount(() => React.createElement(SubscriptionSummary, { account }));
    assert.ok(page.html.includes(trialEndsAt));
    assert.equal(page.html.includes("첫 유료 전환 예정 일시"), state === "trialing");
    assert.equal(page.html.includes("9,900"), state === "trialing");
    assert.equal(page.html.includes("자동 결제 없음"), state === "ending");
    assert.ok(page.html.includes("결제 관리"));
    page.unmount();
  }
});

test("subscription details distinguish renewal, cancellation, overdue payment, prepaid and free access", () => {
  const paid = { active: true, currentPlanMonths: 3, endsAt: "2026-12-15T12:00:00Z" };
  const expired = { active: false, currentPlanMonths: null, endsAt: null };
  for (const [access, state, canOpenBillingPortal, showPlans, description] of [
    [paid, "active", true, false, "자동 갱신 중"], [paid, "ending", true, false, "자동 갱신 해지됨"],
    [paid, "past_due", true, false, "결제 수단을 확인"], [expired, "past_due", true, false, "결제 수단을 확인"],
    [paid, null, true, false, "자동 갱신 없음"], [paid, null, false, true, "자동 갱신 없음"],
    [expired, null, true, true, "이용 중인 유료 구독이 없습니다"], [expired, null, false, true, "이용 중인 유료 구독이 없습니다"],
  ]) {
    const account = { ...access, canOpenBillingPortal, subscription: state ? { months: 3, state } : null };
    const page = mount(() => React.createElement(SubscriptionSummary, { account }));
    assert.ok(page.html.includes(description));
    assert.equal(page.html.includes('dateTime="' + paid.endsAt + '"'), access.active);
    assert.ok(page.html.includes(access.active || state ? "Plus 3개월" : "Free"));
    assert.equal(/<button[^>]*>결제 관리<\/button>/.test(page.html), canOpenBillingPortal);
    assert.equal(page.html.includes("3개월마다"), Boolean(state));
    assert.equal(page.html.includes('href="/plans">요금제 보기</a>'), showPlans);
    if (state && !access.active) assert.ok(page.html.includes("현재 적용된 유료 이용 기간이 없습니다"));
    page.unmount();
  }
});

test("subscription settings fetch only the signed-in member's summary and preserve the guest login return", () => {
  const member = mount(SubscriptionSettings);
  assert.deepEqual(requests, [{ url: "/api/subscriptions/me/", method: "GET" }]);
  member.unmount();
  requests.length = 0;
  session.user = null;
  session.status = "anonymous";
  for (const [language, prefix] of [["ko", ""], ["en", "/en"], ["id", "/id"]]) {
    session.language = language;
    const page = mount(SubscriptionSettings);
    assert.ok(page.html.includes(`href="${prefix}/login?next=${encodeURIComponent(prefix + "/settings/subscription")}"`));
    page.unmount();
  }
  assert.deepEqual(requests, []);
});

test("monthly Plus members see both longer cycles even when they cannot schedule a change", () => {
  const { publicPlans } = require("../src/lib/plans-content.ts");
  const plans = publicPlans.map(offer => ({ ...offer, priceId: `price_${offer.months}` }));
  const nextBillingAt = "2099-12-10T08:00:00Z";
  const monthly = { plans, active: true, currentPlanMonths: 1, endsAt: nextBillingAt, nextBillingAt,
    subscription: { months: 1, state: "active" }, canChangePlan: true, scheduledChange: null };
  const scheduledChange = { id: "schedule", months: 3, amount: 23900, effectiveAt: nextBillingAt };
  for (const { changes, disabled, notice } of [
    { changes: {}, disabled: [] },
    { changes: { subscription: null, nextBillingAt: null, canChangePlan: false }, disabled: [3, 6], notice: /자동 갱신|이용권이 만료/ },
    { changes: { scheduledChange, canChangePlan: false }, disabled: [3, 6], notice: /<button[^>]*>3개월 변경 예약 취소<\/button>/ },
    { changes: { plans: plans.map(offer => offer.months === 3 ? { ...offer, priceId: null } : offer) }, disabled: [3] },
  ]) {
    const page = mount(() => React.createElement(CreditPurchase, { userId: 1, returnId: null,
      planAccount: { ...monthly, ...changes }, onFulfilled() {}, onPlanRefresh() {} }));
    const cards = page.html.match(/<article\b[\s\S]*?<\/article>/g);
    assert.doesNotMatch(page.html, /1개월로 변경|구독하기/);
    for (const months of [3, 6]) {
      const card = cards.find(card => card.includes(`<h2>Plus ${months}개월</h2>`));
      const button = card?.match(new RegExp(`<button([^>]*)>${months}개월로 변경</button>`));
      assert.ok(button, `Plus ${months}개월 card is missing its change button`);
      assert.equal(/\bdisabled\b/.test(button[1]), disabled.includes(months));
      if (disabled.includes(months)) {
        const reasonId = button[1].match(/aria-describedby="([^"]+)"/)?.[1];
        assert.ok(reasonId && card.includes(`id="${reasonId}"`), "disabled button must identify its explanation within this card");
      }
    }
    if (notice) assert.match(page.html, notice);
    page.unmount();
  }
  assert.deepEqual(requests, []);
});

test("a longer cycle must be confirmed with the renewal date, price and zero due today before scheduling once", async t => {
  const nextBillingAt = "2099-12-10T08:00:00Z";
  const account = { active: true, currentPlanMonths: 3, subscription: { state: "active", months: 3 },
    plans: [1, 3, 6].map(months => ({ months, priceId: `price_${months}`, amount: 43900, currency: "krw", bonusCredits: 400 })),
    nextBillingAt, canChangePlan: true, scheduledChange: null };
  const scheduledChange = { id: "sub_sched_six", months: 6, amount: 43900, effectiveAt: nextBillingAt };
  const updated = [];
  const calls = [];
  const clicks = {};
  const runtime = require("react/jsx-runtime");
  const jsx = runtime.jsx;
  t.mock.method(runtime, "jsx", (type, props, key) => {
    if (type === "button") clicks[props.children] = props.onClick;
    return jsx(type, props, key);
  });
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    assert.equal(options.headers["X-CSRFToken"], "synthetic");
    calls.push([url, options.method, JSON.parse(options.body)]);
    return Response.json({ scheduledChange });
  };
  const page = mount(() => React.createElement(CreditPurchase, {
    planAccount: account, onPlanRefresh: value => updated.push(value), userId: 1, returnId: null, onFulfilled() {},
  }));
  assert.doesNotMatch(page.html, /1개월로 변경|3개월로 변경|구독하기/);
  assert.match(page.html, /<dialog[^>]*aria-labelledby=/);
  assert.match(page.html, /오늘 결제할 금액<\/dt><dd>₩0/);
  assert.match(page.html, /다음 결제 금액<\/dt><dd>₩43,900 · 6개월마다/);
  assert.ok(page.html.includes(`dateTime="${nextBillingAt}"`));
  clicks["6개월로 변경"]();
  clicks["돌아가기"]();
  assert.deepEqual(calls, []);
  clicks["6개월로 변경"]();
  clicks["변경 예약"]();
  clicks["변경 예약"]();
  await setImmediate();
  assert.deepEqual(calls, [["/api/subscriptions/me/plan-change/", "POST", { months: 6, priceId: "price_6", effectiveAt: nextBillingAt }]]);
  assert.deepEqual(updated, [scheduledChange]);
  page.unmount();
});

test("settings display a scheduled change and cancel only that reservation before its effective time", async t => {
  const future = "2099-12-10T08:00:00Z";
  const account = { active: true, currentPlanMonths: 1, subscription: { state: "active", months: 1 }, endsAt: future,
    canChangePlan: false, canOpenBillingPortal: true, scheduledChange: { id: "sub_sched_three", months: 3, amount: 23900, effectiveAt: future } };
  let click;
  const runtime = require("react/jsx-runtime");
  const jsx = runtime.jsx;
  t.mock.method(runtime, "jsx", (type, props, key) => {
    if (type === "button" && props.children === "3개월 변경 예약 취소") click = props.onClick;
    return jsx(type, props, key);
  });
  const calls = [], updated = [];
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    assert.equal(options.headers["X-CSRFToken"], "synthetic");
    calls.push([url, options.method, JSON.parse(options.body)]);
    return Response.json({ scheduledChange: null });
  };
  const summary = () => React.createElement(SubscriptionSummary, { account, onRefresh: value => updated.push(value) });
  const page = mount(summary);
  assert.ok(page.html.includes("Plus 1개월") && page.html.includes("Plus 3개월") && page.html.includes("₩23,900"));
  click();
  click();
  await setImmediate();
  assert.deepEqual(calls, [["/api/subscriptions/me/plan-change/", "DELETE", { id: "sub_sched_three", months: 3, effectiveAt: future }]]);
  assert.deepEqual(updated, [null]);
  page.unmount();
  account.scheduledChange.effectiveAt = "2000-12-10T08:00:00Z";
  const expired = mount(summary);
  assert.doesNotMatch(expired.html, /3개월 변경 예약 취소/);
  expired.unmount();
});

test("a change confirmation held open until renewal refreshes the quote without submitting", () => {
  const nextBillingAt = new Date(Date.now() + 60_000).toISOString();
  const account = { active: true, currentPlanMonths: 1, subscription: { state: "active", months: 1 },
    nextBillingAt, canChangePlan: true, scheduledChange: null,
    plans: [{ months: 3, amount: 23900, priceId: "price_3", bonusCredits: 400, currency: "krw" }] };
  let confirm, reloads = 0;
  const { default: PlanChangeControls } = imports["./PlanChangeControls"];
  const tree = mount(() => {
    const controls = PlanChangeControls({ account, onRefresh: () => reloads++ });
    const offers = React.Children.toArray(controls.props.children)[0];
    confirm = offers.props.renderAction(account.plans[0]).props.onConfirm;
    return controls;
  });
  const originalNow = Date.now;
  try {
    Date.now = () => Date.parse(nextBillingAt);
    confirm();
    assert.equal(reloads, 1);
    assert.deepEqual(requests, []);
  } finally {
    Date.now = originalNow;
    tree.unmount();
  }
});

test("the billing button opens a single portal session returning to the localized subscription page", async t => {
  const posts = [], visits = [];
  const portalUrl = "https://billing.stripe.com/p/session/fixture";
  window.location = { assign: url => visits.push(url) };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/csrf/") return Response.json({ csrfToken: "synthetic" });
    posts.push([url, JSON.parse(options.body)]);
    return Response.json({ portalUrl });
  };
  const runtime = require("react/jsx-runtime");
  const jsx = runtime.jsx;
  let click;
  t.mock.method(runtime, "jsx", (type, props, key) => {
    if (type === "button") click = props.onClick;
    return jsx(type, props, key);
  });
  for (const [language, prefix] of [["ko", ""], ["en", "en/"], ["id", "id/"]]) {
    session.language = language;
    const account = { active: false, currentPlanMonths: null, endsAt: null, subscription: null, canOpenBillingPortal: true };
    const page = mount(() => React.createElement(SubscriptionSummary, { account }));
    await Promise.all([click(), click()]);
    assert.deepEqual(posts.splice(0), [["/api/credits/billing-portal/", { from: prefix + "settings/subscription" }]]);
    assert.deepEqual(visits.splice(0), [portalUrl]);
    page.unmount();
  }
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

test("the settings list links to localized exam history, subscription management and refunds without fetching data", async () => {
  const { paymentHistoryContent } = require("../src/lib/credits-content.ts");
  const { pbtContent } = require("../src/lib/exam/pbt-content.ts");
  const { plansContent } = require("../src/lib/plans-content.ts");
  for (const [language, prefix] of [["ko", ""], ["en", "/en"], ["id", "/id"]]) {
    session.language = language;
    const page = await SettingsPage();
    const tree = mount(() => page);
    const { refundTitle, policy } = paymentHistoryContent[language];
    assert.ok(tree.html.includes('<a href="' + prefix + '/settings/exam-history">' + pbtContent[language].history));
    assert.ok(tree.html.includes('<a href="' + prefix + '/settings/subscription">' + plansContent[language].settingsTitle));
    assert.ok(tree.html.includes('<a href="' + prefix + '/settings/refunds">' + refundTitle));
    assert.ok(!tree.html.includes(policy));
    tree.unmount();
  }
  assert.deepEqual(requests, []);
});

test("exam history waits for sign-in and preserves the localized return path", async () => {
  session.user = null;
  for (const status of ["loading", "error", "anonymous"]) {
    session.status = status;
    for (const [language, prefix] of [["ko", ""], ["en", "/en"], ["id", "/id"]]) {
      session.language = language;
      const page = mount(ExamHistory);
      const loginHref = prefix + "/login?next=" + encodeURIComponent(prefix + "/settings/exam-history");
      assert.equal(page.html.includes(loginHref), status === "anonymous");
      page.unmount();
    }
  }
  assert.deepEqual(requests, []);
  session.user = { id: 1 };
  session.status = "authenticated";
  globalThis.fetch = async url => {
    requests.push(url);
    return Response.json({ attempts: [], pageCount: 1 });
  };
  const page = mount(ExamHistory);
  await setImmediate();
  assert.deepEqual(requests, ["/api/pbt/attempts/?format=all&page=1"]);
  page.unmount();
});

test("public refund details link back to settings and keep their language on sign-in", () => {
  session.user = null;
  session.status = "anonymous";
  for (const [language, prefix, title] of [
    ["ko", "", "일회성 크레딧 환불"], ["en", "/en", "One-time credit refunds"], ["id", "/id", "Pengembalian dana isi ulang satu kali"],
  ]) {
    session.language = language;
    const tree = mount(RefundSettings);
    assert.ok(tree.html.includes(title));
    assert.ok(tree.html.includes('href="' + prefix + '/settings"'));
    assert.ok(tree.html.includes(`href="${prefix}/terms"`));
    assert.ok(tree.html.includes(`href="${prefix}/login?next=${encodeURIComponent(prefix + "/settings/refunds")}"`));
    tree.unmount();
  }
  for (const status of ["loading", "error"]) {
    session.status = status;
    const tree = mount(RefundSettings);
    assert.match(tree.html, /<h1[^>]*>/);
    assert.doesNotMatch(tree.html, /login\?next/);
    tree.unmount();
  }
  assert.deepEqual(requests, []);
});

test("signed-in refund details load the shared one-time order list under the refund policy", () => {
  const tree = mount(RefundSettings);
  assert.match(tree.html, /<h1[^>]*>일회성 크레딧 환불<\/h1>[\s\S]*<h2[^>]*>내 충전 주문<\/h2>/);
  assert.doesNotMatch(tree.html, /크레딧으로 돌아가기|login\?next/);
  assert.deepEqual(requests, [{ url: "/api/credits/purchases/?page=1", method: "GET" }]);
  tree.unmount();
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
  assert.match(used, /잔여 900 \/ 1,000 크레딧/);
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
  assert.doesNotMatch(row("held", 1000), /<button/);
  assert.match(row("processing", 1000), /환불 처리 중/);
  assert.doesNotMatch(row("refunded", 0), /<button/);
});

test("refund settings link each order to its localized refund card", async () => {
  const { PaymentRow } = imports["./PaymentHistory"];
  const { contactContent } = require("../src/lib/contact-content.ts");
  for (const [language, prefix, label] of [["ko", "", "주문번호"], ["en", "/en", "Order number"], ["id", "/id", "Nomor pesanan"]]) {
    session.language = language;
    const order = { id: crypto.randomUUID(), paidAt: "2026-11-21T12:00:00Z", credits: 1000, remainingCredits: 900, refundState: "contact" };
    const row = mount(() => React.createElement(PaymentRow, { order, amount: "₩4,900", disabled: false, onRefund() {} }));
    const link = new URL(row.html.match(/<a href="([^"]+)"/)[1], "https://example.test");
    assert.equal(link.pathname, `${prefix}/settings/contact`);
    assert.equal(link.searchParams.get("order"), order.id);
    const page = await ContactPage({ searchParams: Promise.resolve(Object.fromEntries(link.searchParams)) });
    const html = renderToStaticMarkup(page);
    const [general, refund] = html.match(/<section\b[\s\S]*?<\/section>/g);
    const guidance = contactContent[language].refund;
    for (const text of [guidance.description, guidance.emailGuidance, guidance.orderIncluded, `${label}: ${order.id}`]) {
      assert.ok(refund.includes(text));
      assert.ok(!general.includes(text));
    }
    assert.ok(!refund.includes(guidance.includeOrder));
    assert.equal(link.hash, "#refund-inquiry");
    assert.ok(refund.includes(`id="${link.hash.slice(1)}"`) && refund.includes(order.id));
    assert.doesNotMatch(refund, /mailto:|href="[^\"]*\/settings\/refunds"/);
    assert.ok(!general.includes(order.id));
    row.unmount();
  }
  assert.deepEqual(requests, []);
});

test("contact visits without a single valid order show refund guidance and keep the ordinary refund email", async () => {
  const { contactContent } = require("../src/lib/contact-content.ts");
  for (const [language, { refund }] of Object.entries(contactContent)) {
    session.language = language;
    for (const order of [undefined, "invalid", [crypto.randomUUID(), crypto.randomUUID()]]) {
      const page = await ContactPage({ searchParams: Promise.resolve({ order }) });
      const html = renderToStaticMarkup(page);
      assert.ok(html.includes(refund.description) && html.includes(refund.emailGuidance));
      assert.ok(html.includes(refund.includeOrder) && !html.includes(refund.orderIncluded));
      assert.doesNotMatch(html, /body=/);
    }
  }
});

test("only confirming a new full refund submits it and checking an existing request needs no new confirmation", () => {
  const { PaymentRow } = imports["./PaymentHistory"];
  const order = { id: crypto.randomUUID(), paidAt: "2026-11-21T12:00:00Z", credits: 1000, remainingCredits: 1000 };
  let submissions = 0;
  function click(refundState) {
    const rendered = PaymentRow({ order: { ...order, refundState }, amount: "₩4,900", disabled: false,
      onRefund: () => submissions++, onContact: () => assert.fail("unexpected billing inquiry") });
    React.Children.toArray(rendered.props.children).find(child => child.type === "button").props.onClick();
  }
  let accepted = false;
  window.confirm = message => {
    assert.ok(message.includes("₩4,900") && message.includes("1,000"));
    return accepted;
  };
  click("eligible");
  assert.equal(submissions, 0);
  accepted = true;
  click("eligible");
  assert.equal(submissions, 1);
  window.confirm = () => assert.fail("existing refund should check status immediately");
  click("confirming");
  assert.equal(submissions, 2);
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
