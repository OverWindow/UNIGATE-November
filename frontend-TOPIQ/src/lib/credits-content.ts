import type { Language } from "./landing-content";
import type { CreditEntry } from "./writing-api";

interface Copy {
  title: string; available: string; balance: string; reserved: string; unit: string;
  balanceNote: string; transactions: string; transactionNote: string; balanceAfter: string; reservedAfter: string;
  result: string; history: string; empty: string; loading: string; error: string; retry: string; refresh: string;
  loginRequired: string; previous: string; next: string; page: string;
  kinds: Record<CreditEntry["kind"], string>;
}

export const creditsContent: Record<Language, Copy> = {
  ko: {
    title: "크레딧",
    available: "사용 가능", balance: "보유 크레딧", reserved: "예약 중", unit: "크레딧",
    balanceNote: "보유 크레딧에는 예약 중인 금액이 포함됩니다. 사용 가능액은 보유액에서 예약액을 뺀 금액입니다.",
    transactions: "거래 내역", transactionNote: "신규 가입 시 100크레딧을 한 번 지급합니다. 쓰기 세트는 최초 열람 시 100크레딧을 차감하며, 재열람과 문항별 성공 평가 20회에는 추가 비용이 없습니다. 예약·차감·예약 해제는 이전 평가 방식의 거래입니다.",
    balanceAfter: "거래 후 보유", reservedAfter: "거래 후 예약", result: "평가 보기", history: "내 평가 이력",
    empty: "아직 크레딧 거래 내역이 없습니다.", loading: "크레딧 정보를 불러오는 중입니다.",
    error: "크레딧 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", retry: "다시 시도", refresh: "새로고침",
    loginRequired: "로그인하면 내 크레딧과 거래 내역을 확인할 수 있습니다.", previous: "이전", next: "다음", page: "페이지",
    kinds: { grant: "지급", reserve: "예약", capture: "차감", release: "예약 해제", welcome: "신규 가입 지급", unlock: "세트 열람" },
  },
  en: {
    title: "Credits",
    available: "Available", balance: "Total balance", reserved: "Reserved", unit: "credits",
    balanceNote: "Your total balance includes reserved credits. Available credits are your total balance minus reservations.",
    transactions: "Transactions", transactionNote: "New members receive 100 credits once at signup. A writing set costs 100 credits on first access. Reopening and 20 successful evaluations per question are included. Reservations, evaluation charges and releases are legacy transactions.",
    balanceAfter: "Balance after", reservedAfter: "Reserved after", result: "View evaluation", history: "My evaluations",
    empty: "No credit transactions yet.", loading: "Loading your credits…",
    error: "Unable to load your credits. Please try again shortly.", retry: "Try again", refresh: "Refresh",
    loginRequired: "Sign in to view your credits and transactions.", previous: "Previous", next: "Next", page: "Page",
    kinds: { grant: "Granted", reserve: "Reserved", capture: "Charged", release: "Released", welcome: "Signup bonus", unlock: "Set access" },
  },
  id: {
    title: "Kredit",
    available: "Tersedia", balance: "Total saldo", reserved: "Dicadangkan", unit: "kredit",
    balanceNote: "Total saldo termasuk kredit yang dicadangkan. Kredit tersedia adalah total saldo dikurangi cadangan.",
    transactions: "Riwayat transaksi", transactionNote: "Anggota baru mendapat 100 kredit satu kali saat mendaftar. Paket menulis memerlukan 100 kredit saat pertama dibuka. Membuka kembali dan 20 penilaian berhasil per soal sudah termasuk. Cadangan, biaya penilaian, dan pelepasan merupakan transaksi sistem sebelumnya.",
    balanceAfter: "Saldo setelah transaksi", reservedAfter: "Cadangan setelah transaksi", result: "Lihat penilaian", history: "Riwayat penilaian saya",
    empty: "Belum ada transaksi kredit.", loading: "Memuat informasi kredit…",
    error: "Informasi kredit tidak dapat dimuat. Silakan coba lagi sebentar.", retry: "Coba lagi", refresh: "Muat ulang",
    loginRequired: "Masuk untuk melihat kredit dan transaksi Anda.", previous: "Sebelumnya", next: "Berikutnya", page: "Halaman",
    kinds: { grant: "Diberikan", reserve: "Dicadangkan", capture: "Dipotong", release: "Dilepas", welcome: "Bonus pendaftaran", unlock: "Akses paket" },
  },
};
