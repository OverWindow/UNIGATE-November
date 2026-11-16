import type { Language } from "./landing-content";
import type { CreditEntry } from "./writing-api";

interface Copy {
  title: string; description: string; available: string; balance: string; reserved: string; unit: string;
  balanceNote: string; transactions: string; transactionNote: string; balanceAfter: string; reservedAfter: string;
  result: string; history: string; empty: string; loading: string; error: string; retry: string; refresh: string;
  loginRequired: string; previous: string; next: string; page: string;
  kinds: Record<CreditEntry["kind"], string>;
}

export const creditsContent: Record<Language, Copy> = {
  ko: {
    title: "크레딧", description: "사용 가능한 크레딧과 거래 내역을 확인하세요.",
    available: "사용 가능", balance: "보유 크레딧", reserved: "예약 중", unit: "크레딧",
    balanceNote: "보유 크레딧에는 예약 중인 금액이 포함됩니다. 사용 가능액은 보유액에서 예약액을 뺀 금액입니다.",
    transactions: "거래 내역", transactionNote: "예약은 평가를 위해 크레딧을 잠시 확보하는 단계입니다. 평가가 완료되면 차감하고, 실패하면 예약을 해제합니다.",
    balanceAfter: "거래 후 보유", reservedAfter: "거래 후 예약", result: "평가 보기", history: "내 평가 이력",
    empty: "아직 크레딧 거래 내역이 없습니다.", loading: "크레딧 정보를 불러오는 중입니다.",
    error: "크레딧 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", retry: "다시 시도", refresh: "새로고침",
    loginRequired: "로그인하면 내 크레딧과 거래 내역을 확인할 수 있습니다.", previous: "이전", next: "다음", page: "페이지",
    kinds: { grant: "지급", reserve: "예약", capture: "차감", release: "예약 해제" },
  },
  en: {
    title: "Credits", description: "Check your available credits and transaction history.",
    available: "Available", balance: "Total balance", reserved: "Reserved", unit: "credits",
    balanceNote: "Your total balance includes reserved credits. Available credits are your total balance minus reservations.",
    transactions: "Transactions", transactionNote: "A reservation sets credits aside for an evaluation. Credits are charged when it completes, or released if it fails.",
    balanceAfter: "Balance after", reservedAfter: "Reserved after", result: "View evaluation", history: "My evaluations",
    empty: "No credit transactions yet.", loading: "Loading your credits…",
    error: "Unable to load your credits. Please try again shortly.", retry: "Try again", refresh: "Refresh",
    loginRequired: "Sign in to view your credits and transactions.", previous: "Previous", next: "Next", page: "Page",
    kinds: { grant: "Granted", reserve: "Reserved", capture: "Charged", release: "Released" },
  },
  id: {
    title: "Kredit", description: "Lihat kredit yang tersedia dan riwayat transaksi Anda.",
    available: "Tersedia", balance: "Total saldo", reserved: "Dicadangkan", unit: "kredit",
    balanceNote: "Total saldo termasuk kredit yang dicadangkan. Kredit tersedia adalah total saldo dikurangi cadangan.",
    transactions: "Riwayat transaksi", transactionNote: "Cadangan menyisihkan kredit untuk penilaian. Kredit dipotong saat penilaian selesai, atau dilepas jika gagal.",
    balanceAfter: "Saldo setelah transaksi", reservedAfter: "Cadangan setelah transaksi", result: "Lihat penilaian", history: "Riwayat penilaian saya",
    empty: "Belum ada transaksi kredit.", loading: "Memuat informasi kredit…",
    error: "Informasi kredit tidak dapat dimuat. Silakan coba lagi sebentar.", retry: "Coba lagi", refresh: "Muat ulang",
    loginRequired: "Masuk untuk melihat kredit dan transaksi Anda.", previous: "Sebelumnya", next: "Berikutnya", page: "Halaman",
    kinds: { grant: "Diberikan", reserve: "Dicadangkan", capture: "Dipotong", release: "Dilepas" },
  },
};
