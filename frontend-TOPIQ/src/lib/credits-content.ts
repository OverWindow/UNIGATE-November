import type { Language } from "./landing-content";
import type { CreditEntry } from "./writing-api";

interface Copy {
  title: string; available: string; balance: string; reserved: string; unit: string;
  transactions: string; transactionNote: string; balanceAfter: string; reservedAfter: string;
  result: string; history: string; empty: string; loading: string; error: string; retry: string; refresh: string;
  loginRequired: string; previous: string; next: string; page: string;
  kinds: Record<CreditEntry["kind"], string>;
}

export const creditsContent: Record<Language, Copy> = {
  ko: {
    title: "크레딧",
    available: "사용 가능", balance: "보유 크레딧", reserved: "보류", unit: "크레딧",
    transactions: "크레딧 내역", transactionNote: "가입하면 100크레딧을 받습니다. 쓰기 세트는 처음 열 때 100크레딧이 들며, 재열람과 문항당 평가 20회가 포함됩니다.",
    balanceAfter: "남은 크레딧", reservedAfter: "보류 크레딧", result: "평가 보기", history: "내 평가 이력",
    empty: "아직 크레딧 내역이 없습니다.", loading: "크레딧 정보를 불러오는 중입니다.",
    error: "크레딧 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", retry: "다시 시도", refresh: "새로고침",
    loginRequired: "로그인하면 내 크레딧 내역을 확인할 수 있습니다.", previous: "이전", next: "다음", page: "페이지",
    kinds: { grant: "지급", reserve: "보류", capture: "평가 사용", release: "보류 해제", welcome: "신규 가입 지급", unlock: "세트 열람" },
  },
  en: {
    title: "Credits",
    available: "Available", balance: "Total balance", reserved: "On hold", unit: "credits",
    transactions: "Credit history", transactionNote: "Get 100 credits when you sign up. Each writing set costs 100 credits to open and includes repeat access and 20 evaluations per question.",
    balanceAfter: "Remaining credits", reservedAfter: "Credits on hold", result: "View evaluation", history: "My evaluations",
    empty: "No credit activity yet.", loading: "Loading your credits…",
    error: "Unable to load your credits. Please try again shortly.", retry: "Try again", refresh: "Refresh",
    loginRequired: "Sign in to view your credit history.", previous: "Previous", next: "Next", page: "Page",
    kinds: { grant: "Granted", reserve: "On hold", capture: "Charged", release: "Released", welcome: "Signup bonus", unlock: "Set access" },
  },
  id: {
    title: "Kredit",
    available: "Tersedia", balance: "Total saldo", reserved: "Ditahan", unit: "kredit",
    transactions: "Riwayat kredit", transactionNote: "Dapatkan 100 kredit saat mendaftar. Setiap paket menulis memerlukan 100 kredit saat pertama dibuka, termasuk akses ulang dan 20 penilaian per soal.",
    balanceAfter: "Sisa kredit", reservedAfter: "Kredit ditahan", result: "Lihat penilaian", history: "Riwayat penilaian saya",
    empty: "Belum ada riwayat kredit.", loading: "Memuat informasi kredit…",
    error: "Informasi kredit tidak dapat dimuat. Silakan coba lagi sebentar.", retry: "Coba lagi", refresh: "Muat ulang",
    loginRequired: "Masuk untuk melihat riwayat kredit Anda.", previous: "Sebelumnya", next: "Berikutnya", page: "Halaman",
    kinds: { grant: "Diberikan", reserve: "Ditahan", capture: "Dipotong", release: "Dilepas", welcome: "Bonus pendaftaran", unlock: "Akses paket" },
  },
};
