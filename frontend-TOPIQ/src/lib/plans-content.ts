import type { Language } from "./landing-content";
import type { PlanOffer } from "./writing/writing-api";

// Public offers mirror PLAN_AMOUNTS and PLAN_BONUS in backend/accounts/models.py.
export const publicPlans = [
  { months: 1, amount: 9900 },
  { months: 3, amount: 23900 },
  { months: 6, amount: 43900 },
].map<PlanOffer>(offer => ({ ...offer, currency: "krw", bonusCredits: 400, priceId: null, trialDays: offer.months === 1 ? 7 : 0 }));

export function billingTime(language: Language, value: string) {
  return new Intl.DateTimeFormat(language, {
    year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
  }).format(new Date(value));
}

export function planAmount(language: Language, amount: number) {
  return new Intl.NumberFormat(language, { style: "currency", currency: "KRW" }).format(amount);
}

export function planSavingsPercent(amount: number, months: number, monthlyAmount: number) {
  return months > 1 ? Math.max(0, Math.round((1 - amount / (monthlyAmount * months)) * 100)) : 0;
}

interface PlanCopy {
  title: string;
  intro: string;
  login: string; current: string; until: string; freeBenefits: string[];
  term: (months: number) => string; benefits: string[]; unavailable: string;
  paymentStartsNow: string; trialStartsNow: string; unlimitedAccess: string;
  exit: { title: string; description: string; yes: string; no: string };
  savings: (percent: number) => string;
  trial: {
    start: string; pay: string; after: (amount: string) => string;
    cancel: string; bonus: (credits: number) => string; confirm: string; agree: string;
    firstCharge: string; method: string; card: string; active: string; noCharge: string; accessEnds: string;
    checking: string; creating: string; started: string; cardUsed: string; accountUsed: string;
    cardUnavailable: string; termsChanged: string; delayed: string; retry: string; ended: string;
    changeAfter: string; billingPending: string; confirmAgain: string;
  };
  settingsTitle: string; portalUnavailable: string;
  change: {
    select: (months: number) => string; today: string; effective: string; nextCharge: string; confirm: string; back: string;
    scheduled: (plan: string, date: string, amount: string) => string; cancel: (months: number) => string;
    cancelled: string; cancelBeforeEnding: string; alreadyScheduled: string; cannotSchedule: string;
    unavailable: string; conflict: string; error: string;
  };
  details: { myPlan: string; status: string; cycle: string; renewing: string; nonrenewing: string;
    noPaidPeriod: string; free: string; seePlans: string };
  interval: (months: number) => string; manage: string; renewal: string; ending: string; pastDue: string; prepaid: string; inUse: string;
  checkout: Record<"fulfilled" | "expired" | "startError" | "priceChanged", string>;
}

export const plansContent: Record<Language, PlanCopy> = {
  ko: {
    title: "무제한 요금제 둘러보기",
    intro: "읽기, 듣기 모의고사를 무제한으로 풀고, AI 튜터와 함께 쓰기를 연습하세요.",
    login: "로그인하기",
    trial: {
      start: "7일 무료 체험 시작", pay: "결제하고 시작", after: amount => `7일 동안 0원, 이후 매월 ${amount}`,
      cancel: "첫 결제 전에 설정의 구독 관리에서 해지하면 체험 종료일까지 이용할 수 있고 구독료가 청구되지 않습니다.",
      bonus: credits => `첫 결제 성공 후부터 유료 이용 기간에 매월 쓰기용 ${credits}크레딧 지급`,
      confirm: "무료 체험과 자동결제 확인", agree: "표시된 일시부터 등록 카드로 매월 자동 결제되는 데 동의합니다.",
      firstCharge: "첫 유료 전환 예정 일시", method: "결제 수단", card: "Stripe에 등록한 카드", active: "무료 체험 중",
      noCharge: "해지 예약됨 · 자동 결제 없음", accessEnds: "무료 체험 이용 종료", checking: "등록한 카드를 확인하고 있습니다.",
      creating: "무료 체험 시작을 확인하고 있습니다.", started: "무료 체험이 시작되었습니다. 지금 Plus 콘텐츠를 이용할 수 있습니다.",
      cardUsed: "이미 무료 체험에 사용한 카드입니다. 다른 카드로 다시 신청할 수 있습니다.",
      accountUsed: "이 계정은 이미 월간 무료 체험을 사용했습니다. 월간 요금제를 지금 결제하고 이용할 수 있습니다.",
      cardUnavailable: "이 카드를 확인할 수 없습니다. 체험을 다시 선택한 뒤 Stripe에서 카드 정보를 직접 입력해 주세요.",
      termsChanged: "유료 전환 조건이 갱신되었습니다. 새 일시와 금액을 확인하고 다시 동의해 주세요.",
      delayed: "체험 신청 결과를 확인하는 중입니다. 잠시 후 다시 확인해 주세요.", retry: "신청 상태 다시 확인",
      ended: "이 체험 신청은 종료되었습니다.", changeAfter: "유료 이용 기간이 시작된 후 결제 주기를 변경할 수 있습니다.",
      billingPending: "첫 결제 확인 중", confirmAgain: "체험 시작이 확인되지 않았습니다. 표시된 조건을 다시 확인해 주세요.",
    },
    savings: percent => `월간 결제 대비 ${percent}% 절약`,
    settingsTitle: "구독 관리",
    change: {
      select: n => `${n}개월로 변경`,
      today: "오늘 결제할 금액", effective: "적용일", nextCharge: "다음 결제 금액", confirm: "변경 예약", back: "돌아가기",
      scheduled: (plan, date, amount) => `${date}부터 ${plan} 요금제가 적용됩니다. 다음 결제 금액은 ${amount}입니다.`,
      cancel: n => `${n}개월 변경 예약 취소`, cancelled: "변경 예약을 취소했습니다. 현재 결제 주기가 유지됩니다.",
      cancelBeforeEnding: "구독을 해지하려면 먼저 변경 예약을 취소해 주세요.",
      alreadyScheduled: "이미 변경을 예약했습니다. 예약을 취소하면 다시 선택할 수 있습니다.",
      cannotSchedule: "현재 구독 상태에서는 변경을 예약할 수 없습니다.",
      unavailable: "변경 예약 상태를 불러오지 못했습니다.", conflict: "구독 정보가 변경되었습니다. 최신 요금과 예약 상태를 확인해 주세요.",
      error: "요청 결과를 확인하지 못했습니다. 예약 상태를 다시 확인해 주세요.",
    },
    details: { myPlan: "내 이용 상품", status: "구독 상태", cycle: "결제 주기", renewing: "자동 갱신 중",
      nonrenewing: "자동 갱신 없음", noPaidPeriod: "현재 적용된 유료 이용 기간이 없습니다.",
      free: "이용 중인 유료 구독이 없습니다.", seePlans: "요금제 보기" },
    portalUnavailable: "결제 관리를 열지 못했습니다. 잠시 후 다시 시도해 주세요.",
    interval: n => n === 1 ? "매월" : `${n}개월마다`, manage: "결제 관리", renewal: "다음 결제 예정", ending: "자동 갱신 해지됨",
    pastDue: "결제 수단을 확인해 주세요.", prepaid: "자동 갱신이 없는 이용권입니다. 만료 후 새 요금제를 선택할 수 있습니다.",
    inUse: "이 계정의 기존 결제 또는 구독 상태를 확인해 주세요.",
    current: "내 플랜", until: "이용 가능 기한",
    freeBenefits: ["PBT 읽기·듣기 첫 세트 각 1개", "IBT 읽기·듣기 첫 세트 각 1개", "단어장 및 단어 퀴즈 급수별 첫 3세트 열람", "AI 쓰기 튜터용 100크레딧 지급"],
    term: n => `Plus ${n}개월`, unavailable: "신청 불가",
    paymentStartsNow: "지금 바로 결제 후 사용 시작",
    trialStartsNow: "카드 등록 후 결제 없이 사용 시작, 7일 뒤 자동 결제",
    unlimitedAccess: "모든 모의고사 및 단어장 무제한 열람",
    exit: { title: "7일 무료 이용 혜택을 포기하시겠습니까?",
      description: "서비스를 무제한으로 이용할 기회를 놓치지 마세요.", yes: "예", no: "아니오" },
    benefits: ["공개된 PBT·IBT 읽기·듣기 모의고사 무제한 응시", "모든 단어장 및 단어 퀴즈 무제한 열람"],
    checkout: {
      fulfilled: "이용권이 적용되고 400크레딧이 지급되었습니다.",
      expired: "이 결제는 종료되었습니다. 이용권을 다시 선택해 주세요.",
      startError: "결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.", priceChanged: "가격이 변경되었습니다. 갱신된 플랜을 확인해 주세요.",
    },
  },
  en: {
    title: "Explore unlimited plans",
    intro: "Take unlimited reading and listening practice tests and practice writing with the AI tutor.",
    login: "Log in",
    trial: {
      start: "Start 7-day free trial", pay: "Pay and get started", after: amount => `Free for 7 days, then ${amount} a month`,
      cancel: "Cancel in Settings → Manage subscription before the first charge to keep access until the trial ends and pay nothing.",
      bonus: credits => `${credits} writing credits each paid month, starting with the first successful payment`,
      confirm: "Confirm your trial and automatic payments", agree: "I agree to monthly charges to my registered card starting at the date and time shown.",
      firstCharge: "First scheduled charge", method: "Payment method", card: "Card registered with Stripe", active: "Free trial",
      noCharge: "Cancellation scheduled · No automatic charge", accessEnds: "Trial access ends", checking: "Checking your registered card…",
      creating: "Confirming the start of your trial…", started: "Your free trial has started. You can use Plus now.",
      cardUsed: "This card has already been used for a free trial. You can try again with another card.",
      accountUsed: "This account has already used its monthly trial. You can pay now to start the monthly plan.",
      cardUnavailable: "We couldn’t verify this card. Select the trial again and enter your card details directly in Stripe.",
      termsChanged: "The payment terms have been updated. Review the new date, time and amount before agreeing again.",
      delayed: "Your trial request is being confirmed. Check again shortly.", retry: "Check trial status",
      ended: "This trial request has ended.", changeAfter: "You can change the billing cycle once your paid period starts.",
      billingPending: "Confirming your first payment", confirmAgain: "Your trial has not started. Please review the terms and confirm again.",
    },
    savings: percent => `Save ${percent}% compared with monthly billing`,
    settingsTitle: "Manage subscription",
    change: {
      select: n => `Switch to ${n} months`,
      today: "Due today", effective: "Effective date", nextCharge: "Next charge", confirm: "Schedule change", back: "Go back",
      scheduled: (plan, date, amount) => `Switching to ${plan} on ${date}. Next charge: ${amount}.`,
      cancel: n => `Cancel switch to ${n} months`, cancelled: "Scheduled change cancelled. Your current billing cycle continues.",
      cancelBeforeEnding: "To end your subscription, cancel the scheduled change first.",
      alreadyScheduled: "You already have a scheduled change. Cancel it to choose a new plan.",
      cannotSchedule: "You can’t schedule a change on your current subscription.",
      unavailable: "Couldn’t load your scheduled change.", conflict: "Your subscription changed. Check the updated pricing and scheduled change.",
      error: "Couldn’t confirm the result. Check the status of your scheduled change.",
    },
    details: { myPlan: "My plan", status: "Subscription status", cycle: "Billing cycle", renewing: "Auto-renewal on",
      nonrenewing: "No automatic renewal", noPaidPeriod: "No paid access period is currently in effect.",
      free: "You have no paid subscription.", seePlans: "View plans" },
    portalUnavailable: "Couldn’t open the billing page. Please try again shortly.",
    interval: n => n === 1 ? "Every month" : `Every ${n} months`, manage: "Manage billing", renewal: "Next billing date", ending: "Renewal cancelled",
    pastDue: "Please check your payment method.", prepaid: "Your pass doesn’t renew automatically. You can choose a new plan when it expires.",
    inUse: "Please check the existing payment or subscription for this account.",
    current: "My plan", until: "Access until",
    freeBenefits: ["First PBT reading and listening sets", "First IBT reading and listening sets", "First 3 vocabulary sets and quizzes per level", "100 credits for the AI Writing Tutor"],
    term: n => `Plus ${n} ${n === 1 ? "month" : "months"}`, unavailable: "Unavailable",
    paymentStartsNow: "Pay now to get started",
    trialStartsNow: "Register a card to start without paying. You’ll be charged automatically after 7 days.",
    unlimitedAccess: "Unlimited access to all practice tests and vocabulary lists",
    exit: { title: "Give up your 7-day free trial?",
      description: "Don’t miss your chance to get unlimited access.", yes: "Yes", no: "No" },
    benefits: ["Unlimited access to published PBT and IBT reading and listening exams", "Unlimited access to all vocabulary lists and quizzes"],
    checkout: {
      fulfilled: "Your pass was applied and 400 credits were added.",
      expired: "This checkout has ended. Select a pass to try again.",
      startError: "Couldn’t open checkout. Please try again.", priceChanged: "The price changed. Review the updated plans.",
    },
  },
  id: {
    title: "Jelajahi paket tanpa batas",
    intro: "Kerjakan simulasi ujian membaca dan menyimak tanpa batas serta berlatihlah menulis bersama tutor AI.",
    login: "Masuk",
    trial: {
      start: "Mulai uji coba gratis 7 hari", pay: "Bayar dan mulai", after: amount => `Gratis 7 hari, lalu ${amount} per bulan`,
      cancel: "Batalkan di Pengaturan → Kelola langganan sebelum tagihan pertama. Akses tetap berlaku hingga uji coba berakhir tanpa biaya langganan.",
      bonus: credits => `${credits} kredit menulis setiap bulan berbayar, mulai dari pembayaran pertama yang berhasil`,
      confirm: "Konfirmasi uji coba dan pembayaran otomatis", agree: "Saya menyetujui tagihan bulanan otomatis pada kartu terdaftar mulai tanggal dan waktu yang tertera.",
      firstCharge: "Jadwal tagihan pertama", method: "Metode pembayaran", card: "Kartu yang terdaftar di Stripe", active: "Uji coba gratis",
      noCharge: "Pembatalan dijadwalkan · Tanpa tagihan otomatis", accessEnds: "Akhir akses uji coba", checking: "Memeriksa kartu terdaftar…",
      creating: "Mengonfirmasi awal uji coba…", started: "Uji coba gratis sudah dimulai. Kamu bisa menggunakan Plus sekarang.",
      cardUsed: "Kartu ini sudah digunakan untuk uji coba gratis. Coba lagi dengan kartu lain.",
      accountUsed: "Akun ini sudah menggunakan uji coba bulanan. Kamu bisa membayar sekarang untuk mulai menggunakan paket bulanan.",
      cardUnavailable: "Kartu tidak dapat diverifikasi. Pilih uji coba lagi dan masukkan informasi kartu langsung di Stripe.",
      termsChanged: "Ketentuan pembayaran diperbarui. Periksa tanggal, waktu, dan jumlah terbaru sebelum menyetujui kembali.",
      delayed: "Permintaan uji coba sedang dikonfirmasi. Periksa lagi sebentar lagi.", retry: "Periksa status uji coba",
      ended: "Permintaan uji coba ini telah berakhir.", changeAfter: "Siklus tagihan dapat diubah setelah masa berbayar dimulai.",
      billingPending: "Mengonfirmasi pembayaran pertama", confirmAgain: "Uji coba belum dimulai. Periksa ketentuannya lalu konfirmasikan kembali.",
    },
    savings: percent => `Hemat ${percent}% dibanding tagihan bulanan`,
    settingsTitle: "Kelola langganan",
    change: {
      select: n => `Ganti ke ${n} bulan`,
      today: "Tagihan hari ini", effective: "Tanggal mulai", nextCharge: "Tagihan berikutnya", confirm: "Jadwalkan perubahan", back: "Kembali",
      scheduled: (plan, date, amount) => `Paket akan berubah menjadi ${plan} pada ${date}. Tagihan berikutnya: ${amount}.`,
      cancel: n => `Batalkan perubahan ke ${n} bulan`, cancelled: "Perubahan terjadwal dibatalkan. Siklus tagihan saat ini tetap berlaku.",
      cancelBeforeEnding: "Untuk mengakhiri langganan, batalkan perubahan terjadwal terlebih dahulu.",
      alreadyScheduled: "Perubahan sudah dijadwalkan. Batalkan terlebih dahulu untuk memilih paket lain.",
      cannotSchedule: "Perubahan paket belum tersedia untuk status langgananmu saat ini.",
      unavailable: "Status perubahan terjadwal gagal dimuat.", conflict: "Langganan Anda berubah. Periksa harga dan jadwal perubahan terbaru.",
      error: "Hasil permintaan belum dapat dikonfirmasi. Periksa status perubahan terjadwal.",
    },
    details: { myPlan: "Paket saya", status: "Status langganan", cycle: "Siklus tagihan", renewing: "Perpanjangan otomatis aktif",
      nonrenewing: "Tanpa perpanjangan otomatis", noPaidPeriod: "Saat ini tidak ada masa akses berbayar yang aktif.",
      free: "Anda tidak memiliki langganan berbayar.", seePlans: "Lihat paket" },
    portalUnavailable: "Halaman pembayaran tidak dapat dibuka. Silakan coba lagi.",
    interval: n => n === 1 ? "Setiap bulan" : `Setiap ${n} bulan`, manage: "Kelola pembayaran", renewal: "Tagihan berikutnya", ending: "Perpanjangan dibatalkan",
    pastDue: "Periksa metode pembayaran Anda.", prepaid: "Paketmu tidak diperpanjang otomatis. Kamu bisa memilih paket baru setelah masa berlakunya berakhir.",
    inUse: "Periksa pembayaran atau langganan yang sudah ada untuk akun ini.",
    current: "Paket saya", until: "Akses hingga",
    freeBenefits: ["Set pertama membaca dan menyimak PBT", "Set pertama membaca dan menyimak IBT", "3 set kosakata dan kuis pertama per tingkat", "100 kredit untuk Tutor Menulis AI"],
    term: n => `Plus ${n} bulan`, unavailable: "Tidak tersedia",
    paymentStartsNow: "Bayar sekarang untuk mulai menggunakan layanan",
    trialStartsNow: "Daftarkan kartu untuk mulai tanpa biaya. Tagihan otomatis dilakukan setelah 7 hari.",
    unlimitedAccess: "Akses tanpa batas ke semua simulasi ujian dan daftar kosakata",
    exit: { title: "Lewatkan uji coba gratis 7 hari?",
      description: "Jangan lewatkan kesempatan untuk mendapatkan akses tanpa batas.", yes: "Ya", no: "Tidak" },
    benefits: ["Akses tanpa batas ke semua simulasi membaca dan menyimak PBT dan IBT yang tersedia", "Akses tanpa batas ke semua daftar kosakata dan kuis kosakata"],
    checkout: {
      fulfilled: "Paket sudah diterapkan dan 400 kredit telah ditambahkan.",
      expired: "Sesi pembayaran ini telah berakhir. Pilih paket untuk mencoba lagi.",
      startError: "Pembayaran tidak dapat dibuka. Silakan coba lagi.", priceChanged: "Harga telah berubah. Periksa kembali paket yang tersedia.",
    },
  },
};
