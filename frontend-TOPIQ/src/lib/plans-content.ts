import type { Language } from "./landing-content";
import type { PlanOffer } from "./writing/writing-api";

// Public offers mirror PLAN_AMOUNTS and PLAN_BONUS in backend/accounts/models.py.
export const publicPlans = [
  { months: 1, amount: 9900 },
  { months: 3, amount: 23900 },
  { months: 6, amount: 43900 },
].map<PlanOffer>(offer => ({ ...offer, currency: "krw", bonusCredits: 400, priceId: null }));

export function planSavingsPercent(amount: number, months: number, monthlyAmount: number) {
  return months > 1 ? Math.max(0, Math.round((1 - amount / (monthlyAmount * months)) * 100)) : 0;
}

interface PlanCopy {
  intro: string;
  login: string; current: string; until: string; freeBenefits: string[];
  term: (months: number) => string; benefits: (credits: number) => string[]; buy: string; unavailable: string;
  savings: (percent: number) => string;
  settingsTitle: string; portalUnavailable: string;
  change: {
    select: (months: number) => string; today: string; effective: string; nextCharge: string; confirm: string; back: string;
    scheduled: (plan: string, date: string, amount: string) => string; cancel: (months: number) => string;
    cancelled: string; cancelBeforeEnding: string; unavailable: string; conflict: string; error: string;
  };
  details: { myPlan: string; status: string; cycle: string; renewing: string; nonrenewing: string;
    noPaidPeriod: string; free: string; seePlans: string };
  interval: (months: number) => string; manage: string; renewal: string; ending: string; pastDue: string; prepaid: string; inUse: string;
  checkout: Record<"fulfilled" | "cancelled" | "expired" | "startError" | "priceChanged", string>;
}

export const plansContent: Record<Language, PlanCopy> = {
  ko: {
    intro: "읽기, 듣기 모의고사를 무제한으로 풀고, AI 튜터와 함께 쓰기를 연습하세요.",
    login: "로그인하기",
    savings: percent => `월간 결제 대비 ${percent}% 절약`,
    settingsTitle: "구독 관리",
    change: {
      select: n => `${n}개월로 변경`,
      today: "오늘 결제할 금액", effective: "적용일", nextCharge: "다음 결제 금액", confirm: "변경 예약", back: "돌아가기",
      scheduled: (plan, date, amount) => `${date}부터 ${plan} 요금제가 적용됩니다. 다음 결제 금액은 ${amount}입니다.`,
      cancel: n => `${n}개월 변경 예약 취소`, cancelled: "변경 예약을 취소했습니다. 현재 결제 주기가 유지됩니다.",
      cancelBeforeEnding: "구독을 해지하려면 먼저 변경 예약을 취소해 주세요.",
      unavailable: "변경 예약 상태를 불러오지 못했습니다.", conflict: "구독 정보가 변경되었습니다. 최신 요금과 예약 상태를 확인해 주세요.",
      error: "요청 결과를 확인하지 못했습니다. 예약 상태를 다시 확인해 주세요.",
    },
    details: { myPlan: "내 이용 상품", status: "구독 상태", cycle: "결제 주기", renewing: "자동 갱신 중",
      nonrenewing: "자동 갱신 없음", noPaidPeriod: "현재 적용된 유료 이용 기간이 없습니다.",
      free: "이용 중인 유료 구독이 없습니다.", seePlans: "요금제 보기" },
    portalUnavailable: "결제 관리를 열지 못했습니다. 잠시 후 다시 시도해 주세요.",
    interval: n => n === 1 ? "매월" : `${n}개월마다`, manage: "결제 관리", renewal: "다음 결제 예정", ending: "자동 갱신 해지됨",
    pastDue: "결제 수단을 확인해 주세요.", prepaid: "현재 이용권이 만료되면 구독을 시작할 수 있습니다.",
    inUse: "이 계정의 기존 결제 또는 구독 상태를 확인해 주세요.",
    current: "내 플랜", until: "이용 가능 기한",
    freeBenefits: ["PBT 읽기·듣기 첫 세트 각 1개", "IBT 읽기·듣기 첫 세트 각 1개", "단어장 및 단어 퀴즈 급수별 첫 3세트 열람", "AI 쓰기 튜터용 100크레딧 지급"],
    term: n => `Plus ${n}개월`, buy: "구독하기", unavailable: "구독 준비 중",
    benefits: credits => ["공개된 PBT·IBT 읽기·듣기 모의고사 무제한 응시", "모든 단어장 및 단어 퀴즈 무제한 열람",
      `AI 쓰기 튜터용 매월 ${credits}크레딧 지급`],
    checkout: {
      fulfilled: "이용권이 적용되고 400크레딧이 지급되었습니다.",
      cancelled: "결제창에서 돌아왔습니다. 이용권을 선택해 다시 결제할 수 있습니다.", expired: "이 결제는 종료되었습니다. 이용권을 다시 선택해 주세요.",
      startError: "결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.", priceChanged: "가격이 변경되었습니다. 갱신된 플랜을 확인해 주세요.",
    },
  },
  en: {
    intro: "Take unlimited reading and listening practice tests and practice writing with the AI tutor.",
    login: "Log in",
    savings: percent => `Save ${percent}% compared with monthly billing`,
    settingsTitle: "Manage subscription",
    change: {
      select: n => `Switch to ${n} months`,
      today: "Due today", effective: "Effective date", nextCharge: "Next charge", confirm: "Schedule change", back: "Go back",
      scheduled: (plan, date, amount) => `Switching to ${plan} on ${date}. Next charge: ${amount}.`,
      cancel: n => `Cancel switch to ${n} months`, cancelled: "Scheduled change cancelled. Your current billing cycle continues.",
      cancelBeforeEnding: "To end your subscription, cancel the scheduled change first.",
      unavailable: "Couldn’t load your scheduled change.", conflict: "Your subscription changed. Check the updated pricing and scheduled change.",
      error: "Couldn’t confirm the result. Check the status of your scheduled change.",
    },
    details: { myPlan: "My plan", status: "Subscription status", cycle: "Billing cycle", renewing: "Auto-renewal on",
      nonrenewing: "No automatic renewal", noPaidPeriod: "No paid access period is currently in effect.",
      free: "You have no paid subscription.", seePlans: "View plans" },
    portalUnavailable: "Couldn’t open the billing page. Please try again shortly.",
    interval: n => n === 1 ? "Every month" : `Every ${n} months`, manage: "Manage billing", renewal: "Next billing date", ending: "Renewal cancelled",
    pastDue: "Please check your payment method.", prepaid: "You can subscribe when your current pass expires.",
    inUse: "Please check the existing payment or subscription for this account.",
    current: "My plan", until: "Access until",
    freeBenefits: ["First PBT reading and listening sets", "First IBT reading and listening sets", "First 3 vocabulary sets and quizzes per level", "100 credits for the AI Writing Tutor"],
    term: n => `Plus ${n} ${n === 1 ? "month" : "months"}`, buy: "Subscribe", unavailable: "Unavailable",
    benefits: credits => ["Unlimited access to published PBT and IBT reading and listening exams", "Unlimited access to all vocabulary lists and quizzes",
      `${credits} credits each month for the AI Writing Tutor`],
    checkout: {
      fulfilled: "Your pass was applied and 400 credits were added.",
      cancelled: "You left checkout. Select a pass to resume.", expired: "This checkout has ended. Select a pass to try again.",
      startError: "Couldn’t open checkout. Please try again.", priceChanged: "The price changed. Review the updated plans.",
    },
  },
  id: {
    intro: "Kerjakan simulasi ujian membaca dan menyimak tanpa batas serta berlatihlah menulis bersama tutor AI.",
    login: "Masuk",
    savings: percent => `Hemat ${percent}% dibanding tagihan bulanan`,
    settingsTitle: "Kelola langganan",
    change: {
      select: n => `Ganti ke ${n} bulan`,
      today: "Tagihan hari ini", effective: "Tanggal mulai", nextCharge: "Tagihan berikutnya", confirm: "Jadwalkan perubahan", back: "Kembali",
      scheduled: (plan, date, amount) => `Paket akan berubah menjadi ${plan} pada ${date}. Tagihan berikutnya: ${amount}.`,
      cancel: n => `Batalkan perubahan ke ${n} bulan`, cancelled: "Perubahan terjadwal dibatalkan. Siklus tagihan saat ini tetap berlaku.",
      cancelBeforeEnding: "Untuk mengakhiri langganan, batalkan perubahan terjadwal terlebih dahulu.",
      unavailable: "Status perubahan terjadwal gagal dimuat.", conflict: "Langganan Anda berubah. Periksa harga dan jadwal perubahan terbaru.",
      error: "Hasil permintaan belum dapat dikonfirmasi. Periksa status perubahan terjadwal.",
    },
    details: { myPlan: "Paket saya", status: "Status langganan", cycle: "Siklus tagihan", renewing: "Perpanjangan otomatis aktif",
      nonrenewing: "Tanpa perpanjangan otomatis", noPaidPeriod: "Saat ini tidak ada masa akses berbayar yang aktif.",
      free: "Anda tidak memiliki langganan berbayar.", seePlans: "Lihat paket" },
    portalUnavailable: "Halaman pembayaran tidak dapat dibuka. Silakan coba lagi.",
    interval: n => n === 1 ? "Setiap bulan" : `Setiap ${n} bulan`, manage: "Kelola pembayaran", renewal: "Tagihan berikutnya", ending: "Perpanjangan dibatalkan",
    pastDue: "Periksa metode pembayaran Anda.", prepaid: "Anda dapat berlangganan setelah paket saat ini berakhir.",
    inUse: "Periksa pembayaran atau langganan yang sudah ada untuk akun ini.",
    current: "Paket saya", until: "Akses hingga",
    freeBenefits: ["Set pertama membaca dan menyimak PBT", "Set pertama membaca dan menyimak IBT", "3 set kosakata dan kuis pertama per tingkat", "100 kredit untuk Tutor Menulis AI"],
    term: n => `Plus ${n} bulan`, buy: "Berlangganan", unavailable: "Belum tersedia",
    benefits: credits => ["Akses tanpa batas ke semua simulasi membaca dan menyimak PBT dan IBT yang tersedia", "Akses tanpa batas ke semua daftar kosakata dan kuis kosakata",
      `${credits} kredit setiap bulan untuk Tutor Menulis AI`],
    checkout: {
      fulfilled: "Paket sudah diterapkan dan 400 kredit telah ditambahkan.",
      cancelled: "Anda keluar dari pembayaran. Pilih paket untuk melanjutkan.", expired: "Sesi pembayaran ini telah berakhir. Pilih paket untuk mencoba lagi.",
      startError: "Pembayaran tidak dapat dibuka. Silakan coba lagi.", priceChanged: "Harga telah berubah. Periksa kembali paket yang tersedia.",
    },
  },
};
