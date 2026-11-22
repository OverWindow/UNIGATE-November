import type { Language } from "./landing-content";
import type { PlanOffer } from "./writing/writing-api";

// Public offers mirror PLAN_AMOUNTS and PLAN_BONUS in backend/accounts/models.py.
export const publicPlans = [
  { months: 1, amount: 9900 },
  { months: 3, amount: 23900 },
  { months: 6, amount: 43900 },
].map<PlanOffer>(offer => ({ ...offer, currency: "krw", bonusCredits: 400, priceId: null }));

interface PlanCopy {
  login: string; billingNote: string; current: string; until: string; freeBenefits: string[];
  term: (months: number) => string; benefits: (credits: number) => string[]; buy: string; unavailable: string;
  interval: (months: number) => string; manage: string; renewal: string; ending: string; pastDue: string; prepaid: string; inUse: string;
  checkout: Record<"fulfilled" | "cancelled" | "expired" | "startError" | "priceChanged", string>;
}

export const plansContent: Record<Language, PlanCopy> = {
  ko: {
    login: "로그인하기",
    billingNote: "Plus는 선택한 주기마다 자동 결제됩니다. 다음 결제일 전에 구독 관리에서 해지하면 이미 결제한 기간의 마지막 날까지 이용할 수 있습니다.",
    interval: n => n === 1 ? "매월" : `${n}개월마다`, manage: "구독 관리 및 해지", renewal: "다음 결제 예정", ending: "자동 갱신 해지 예정",
    pastDue: "결제 수단을 확인해 주세요.", prepaid: "현재 이용권이 만료되면 구독을 시작할 수 있습니다.",
    inUse: "이 계정의 기존 결제 또는 구독 상태를 확인해 주세요.",
    current: "내 플랜", until: "만료 일시",
    freeBenefits: ["PBT 읽기·듣기 첫 세트 각 1개", "IBT 읽기·듣기 첫 세트 각 1개", "공개된 첫 세트 반복 응시"],
    term: n => `Plus ${n}개월`, buy: "구독하기", unavailable: "구독 준비 중",
    benefits: credits => ["공개된 PBT·IBT 읽기·듣기 모의고사 무료 응시", `매월 ${credits}크레딧 누적 지급`,
      "쓰기 세트당 100크레딧으로 해제", "해제한 세트는 문항당 AI 첨삭 최대 20회"],
    checkout: {
      fulfilled: "이용권이 적용되고 400크레딧이 지급되었습니다.",
      cancelled: "결제창에서 돌아왔습니다. 이용권을 선택해 다시 결제할 수 있습니다.", expired: "이 결제는 종료되었습니다. 이용권을 다시 선택해 주세요.",
      startError: "결제창을 열지 못했습니다. 잠시 후 다시 시도해 주세요.", priceChanged: "가격이 변경되었습니다. 갱신된 플랜을 확인해 주세요.",
    },
  },
  en: {
    login: "Log in",
    billingNote: "Plus renews automatically at your chosen interval. Cancel before your next charge in Manage subscription to keep access through the paid period.",
    interval: n => n === 1 ? "Every month" : `Every ${n} months`, manage: "Manage or cancel subscription", renewal: "Next billing date", ending: "Renewal cancelled",
    pastDue: "Please check your payment method.", prepaid: "You can subscribe when your current pass expires.",
    inUse: "Please check the existing payment or subscription for this account.",
    current: "My plan", until: "Expires",
    freeBenefits: ["First PBT reading and listening sets", "First IBT reading and listening sets", "Retake these four sets"],
    term: n => `Plus ${n} ${n === 1 ? "month" : "months"}`, buy: "Subscribe", unavailable: "Unavailable",
    benefits: credits => ["Free access to all published PBT and IBT reading and listening exams", `${credits} credits each month, with unused credits carried over`,
      "Unlock writing sets for 100 credits each", "Up to 20 AI reviews per question in each unlocked set"],
    checkout: {
      fulfilled: "Your pass was applied and 400 credits were added.",
      cancelled: "You left checkout. Select a pass to resume.", expired: "This checkout has ended. Select a pass to try again.",
      startError: "Couldn’t open checkout. Please try again.", priceChanged: "The price changed. Review the updated plans.",
    },
  },
  id: {
    login: "Masuk",
    billingNote: "Plus diperpanjang otomatis sesuai periode pilihan Anda. Batalkan sebelum tagihan berikutnya melalui Kelola langganan untuk tetap menikmati akses hingga akhir periode yang sudah dibayar.",
    interval: n => n === 1 ? "Setiap bulan" : `Setiap ${n} bulan`, manage: "Kelola atau batalkan langganan", renewal: "Tagihan berikutnya", ending: "Perpanjangan dibatalkan",
    pastDue: "Periksa metode pembayaran Anda.", prepaid: "Anda dapat berlangganan setelah paket saat ini berakhir.",
    inUse: "Periksa pembayaran atau langganan yang sudah ada untuk akun ini.",
    current: "Paket saya", until: "Berakhir",
    freeBenefits: ["Set pertama membaca dan menyimak PBT", "Set pertama membaca dan menyimak IBT", "Ulangi keempat set tersebut"],
    term: n => `Plus ${n} bulan`, buy: "Berlangganan", unavailable: "Belum tersedia",
    benefits: credits => ["Akses gratis ke semua simulasi ujian membaca dan menyimak PBT dan IBT yang tersedia", `${credits} kredit setiap bulan, sisa kredit tetap tersimpan`,
      "Buka paket menulis dengan 100 kredit per paket", "Hingga 20 ulasan AI per soal dalam paket yang sudah dibuka"],
    checkout: {
      fulfilled: "Paket sudah diterapkan dan 400 kredit telah ditambahkan.",
      cancelled: "Anda keluar dari pembayaran. Pilih paket untuk melanjutkan.", expired: "Sesi pembayaran ini telah berakhir. Pilih paket untuk mencoba lagi.",
      startError: "Pembayaran tidak dapat dibuka. Silakan coba lagi.", priceChanged: "Harga telah berubah. Periksa kembali paket yang tersedia.",
    },
  },
};
