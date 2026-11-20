import type { Language } from "./landing-content";
import type { CreditEntry } from "./writing/writing-api";

interface Copy {
  title: string; available: string; balance: string; reserved: string; unit: string;
  transactions: string; transactionNote: string; balanceAfter: string; reservedAfter: string;
  result: string; history: string; empty: string; loading: string; error: string; retry: string; refresh: string;
  loginRequired: string; previous: string; next: string; page: string;
  buy: (credits: string, amount: string) => string; checkAgain: string; priceLoading: string; priceUnavailable: string;
  paymentHistory: string; portal: Record<"opening" | "empty" | "error", string>;
  checkout: Record<"opening" | "checking" | "delayed" | "cancelled" | "fulfilled" | "expired" | "startError" | "checkError" | "unavailable" | "priceChanged", string>;
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
    buy: (credits, amount) => `${credits}크레딧 충전 · ${amount}원`, checkAgain: "결제 상태 다시 확인",
    priceLoading: "충전 가격을 불러오는 중입니다.", priceUnavailable: "충전 가격을 불러올 수 없습니다.",
    paymentHistory: "결제 내역", portal: {
      opening: "Stripe 결제 내역을 여는 중입니다.",
      empty: "Stripe에서 볼 수 있는 결제 내역이 아직 없습니다. 이전 충전은 아래 크레딧 내역에서 확인해 주세요.",
      error: "결제 내역을 열지 못했습니다. 잠시 후 다시 시도해 주세요.",
    },
    checkout: {
      opening: "Stripe 결제창을 여는 중입니다.", checking: "결제 확인 중입니다.",
      delayed: "결제 확인에 시간이 걸리고 있습니다. 잠시 후 상태를 다시 확인해 주세요.",
      cancelled: "결제창에서 돌아왔습니다. 충전 버튼을 눌러 다시 결제할 수 있습니다.",
      fulfilled: "1,000크레딧을 충전했습니다.", expired: "결제 시간이 만료되었습니다. 새로 충전할 수 있습니다.",
      startError: "결제창을 열지 못했습니다. 잠시 후 충전 버튼을 다시 눌러 주세요.",
      checkError: "결제 상태를 불러오지 못했습니다.", unavailable: "이 주문을 찾을 수 없습니다.",
      priceChanged: "충전 가격이 변경되었습니다. 새 가격을 확인한 뒤 결제를 진행해 주세요.",
    },
    kinds: { grant: "지급", reserve: "보류", capture: "평가 사용", release: "보류 해제", welcome: "신규 가입 지급", unlock: "세트 열람", purchase: "유료 충전" },
  },
  en: {
    title: "Credits",
    available: "Available", balance: "Total balance", reserved: "On hold", unit: "credits",
    transactions: "Credit history", transactionNote: "Get 100 credits when you sign up. Each writing set costs 100 credits to open and includes repeat access and 20 evaluations per question.",
    balanceAfter: "Remaining credits", reservedAfter: "Credits on hold", result: "View evaluation", history: "My evaluations",
    empty: "No credit activity yet.", loading: "Loading your credits…",
    error: "Unable to load your credits. Please try again shortly.", retry: "Try again", refresh: "Refresh",
    loginRequired: "Sign in to view your credit history.", previous: "Previous", next: "Next", page: "Page",
    buy: (credits, amount) => `Buy ${credits} credits · ₩${amount}`, checkAgain: "Check payment status",
    priceLoading: "Loading the purchase price…", priceUnavailable: "Couldn’t load the purchase price.",
    paymentHistory: "Payment history", portal: {
      opening: "Opening your Stripe payment history…",
      empty: "You don’t have any invoices to view in Stripe yet. You can find past top-ups in your credit history below.",
      error: "Couldn’t open your payment history. Please try again shortly.",
    },
    checkout: {
      opening: "Opening Stripe Checkout…", checking: "Confirming your payment…",
      delayed: "Your payment is still being confirmed. Check its status again shortly.",
      cancelled: "You left checkout. Use the purchase button to return to checkout.",
      fulfilled: "1,000 credits added.", expired: "Checkout expired. You can start a new purchase.",
      startError: "Couldn’t open checkout. Try the purchase button again shortly.",
      checkError: "Couldn’t load the payment status.", unavailable: "Order not found.",
      priceChanged: "The price has changed. Review the new price before continuing.",
    },
    kinds: { grant: "Granted", reserve: "On hold", capture: "Charged", release: "Released", welcome: "Signup bonus", unlock: "Set access", purchase: "Credit purchase" },
  },
  id: {
    title: "Kredit",
    available: "Tersedia", balance: "Total saldo", reserved: "Ditahan", unit: "kredit",
    transactions: "Riwayat kredit", transactionNote: "Dapatkan 100 kredit saat mendaftar. Setiap paket menulis memerlukan 100 kredit saat pertama dibuka, termasuk akses ulang dan 20 penilaian per soal.",
    balanceAfter: "Sisa kredit", reservedAfter: "Kredit ditahan", result: "Lihat penilaian", history: "Riwayat penilaian saya",
    empty: "Belum ada riwayat kredit.", loading: "Memuat informasi kredit…",
    error: "Informasi kredit tidak dapat dimuat. Silakan coba lagi sebentar.", retry: "Coba lagi", refresh: "Muat ulang",
    loginRequired: "Masuk untuk melihat riwayat kredit Anda.", previous: "Sebelumnya", next: "Berikutnya", page: "Halaman",
    buy: (credits, amount) => `Beli ${credits} kredit · ₩${amount}`, checkAgain: "Periksa status pembayaran",
    priceLoading: "Memuat harga kredit…", priceUnavailable: "Harga kredit tidak dapat dimuat.",
    paymentHistory: "Riwayat pembayaran", portal: {
      opening: "Membuka riwayat pembayaran Stripe…",
      empty: "Belum ada faktur yang dapat dilihat di Stripe. Isi ulang sebelumnya dapat dilihat di riwayat kredit di bawah.",
      error: "Riwayat pembayaran tidak dapat dibuka. Silakan coba lagi sebentar.",
    },
    checkout: {
      opening: "Membuka halaman pembayaran Stripe…", checking: "Mengonfirmasi pembayaran…",
      delayed: "Pembayaran masih diproses. Periksa kembali statusnya sebentar lagi.",
      cancelled: "Anda telah keluar dari halaman pembayaran. Tekan tombol pembelian untuk melanjutkan.",
      fulfilled: "1.000 kredit telah ditambahkan.", expired: "Sesi pembayaran berakhir. Anda dapat memulai pembelian baru.",
      startError: "Halaman pembayaran tidak dapat dibuka. Coba lagi sebentar.",
      checkError: "Status pembayaran tidak dapat dimuat.", unavailable: "Pesanan tidak ditemukan.",
      priceChanged: "Harga telah berubah. Periksa harga baru sebelum melanjutkan pembayaran.",
    },
    kinds: { grant: "Diberikan", reserve: "Ditahan", capture: "Dipotong", release: "Dilepas", welcome: "Bonus pendaftaran", unlock: "Akses paket", purchase: "Pembelian kredit" },
  },
};
