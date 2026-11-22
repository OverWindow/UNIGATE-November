import type { Language } from "./landing-content";
import type { CreditEntry } from "./writing/writing-api";

export const billingEmail = "billing@unigate.kr";
export const paymentHistoryContent = {
  ko: {
    back: "크레딧으로 돌아가기", receipts: "Stripe 영수증", empty: "아직 일회성 충전 결제가 없습니다.", refund: "전액 환불", contact: "고객 문의",
    remaining: "잔여", held: "크레딧 보류 중", processing: "환불 처리 중", refunded: "전액 환불 완료",
    confirming: "환불 접수 확인", error: "환불 상태를 확인하지 못했습니다. 내역을 다시 확인해 주세요.",
    failed: "환불이 완료되지 않았습니다. 다시 시도하거나 결제 문의를 이용해 주세요.", subject: "TOPIQ 결제 문의",
    confirm: (amount: string, credits: string) => `${amount} 전액을 환불하고 ${credits}크레딧을 회수할까요?`,
  },
  en: {
    back: "Back to credits", receipts: "Stripe receipts", empty: "No one-time top-ups yet.", refund: "Full refund", contact: "Contact billing",
    remaining: "Remaining", held: "Credits on hold", processing: "Refund processing", refunded: "Fully refunded",
    confirming: "Check refund request", error: "Couldn’t confirm the refund status. Refresh your payment history.",
    failed: "The refund did not complete. Try again or contact billing.", subject: "TOPIQ billing enquiry",
    confirm: (amount: string, credits: string) => `Refund ${amount} in full and return ${credits} credits?`,
  },
  id: {
    back: "Kembali ke kredit", receipts: "Kuitansi Stripe", empty: "Belum ada pembayaran isi ulang satu kali.", refund: "Pengembalian dana penuh", contact: "Hubungi layanan pembayaran",
    remaining: "Sisa", held: "Kredit ditahan", processing: "Pengembalian dana diproses", refunded: "Dana dikembalikan penuh",
    confirming: "Periksa permintaan", error: "Status pengembalian dana belum terkonfirmasi. Muat ulang riwayat pembayaran.",
    failed: "Pengembalian dana belum selesai. Coba lagi atau hubungi layanan pembayaran.", subject: "Pertanyaan pembayaran TOPIQ",
    confirm: (amount: string, credits: string) => `Kembalikan dana penuh ${amount} dan tarik ${credits} kredit?`,
  },
};

interface Copy {
  title: string; available: string; balance: string; reserved: string; unit: string;
  pendingRefund: (amount: string) => string;
  transactions: string; transactionNote: string; balanceAfter: string; reservedAfter: string;
  result: string; history: string; empty: string; loading: string; error: string; retry: string; refresh: string;
  loginRequired: string; previous: string; next: string; page: string;
  buy: (credits: string, amount: string) => string; checkAgain: string; priceLoading: string; priceUnavailable: string;
  cardIssuerNotice: string; paymentHistory: string; portal: Record<"opening" | "empty" | "error", string>;
  checkout: Record<"opening" | "checking" | "delayed" | "cancelled" | "fulfilled" | "expired" | "startError" | "checkError" | "unavailable" | "priceChanged", string>;
  kinds: Record<CreditEntry["kind"], string>;
}

export const creditsContent: Record<Language, Copy> = {
  ko: {
    title: "크레딧",
    available: "사용 가능", balance: "보유 크레딧", reserved: "보류", unit: "크레딧",
    pendingRefund: amount => `환불로 차감할 크레딧이 ${amount}개 남았습니다. 새로 적립되거나 보류가 해제될 때 자동으로 차감됩니다.`,
    transactions: "크레딧 내역", transactionNote: "가입하면 100크레딧을 받습니다. Free와 Plus 모두 쓰기 세트를 처음 열 때 100크레딧을 사용합니다. 한 번 연 세트는 다시 열 수 있고, 문항당 AI 첨삭을 최대 20회 받을 수 있습니다.",
    balanceAfter: "남은 크레딧", reservedAfter: "보류 크레딧", result: "평가 보기", history: "내 평가 이력",
    empty: "아직 크레딧 내역이 없습니다.", loading: "크레딧 정보를 불러오는 중입니다.",
    error: "크레딧 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", retry: "다시 시도", refresh: "새로고침",
    loginRequired: "로그인하면 내 크레딧 내역을 확인할 수 있습니다.", previous: "이전", next: "다음", page: "페이지",
    buy: (credits, amount) => `${credits}크레딧 충전 · ${amount}원`, checkAgain: "결제 상태 다시 확인",
    cardIssuerNotice: "결제 시 한국 밖에서 발급된 카드를 사용해 주세요.",
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
    kinds: { grant: "지급", reserve: "보류", capture: "평가 사용", release: "보류 해제", welcome: "신규 가입 지급", unlock: "세트 열람", purchase: "유료 충전", plan_bonus: "플랜 지급", refund: "환불 차감", restore: "환불 복원" },
  },
  en: {
    title: "Credits",
    available: "Available", balance: "Total balance", reserved: "On hold", unit: "credits",
    pendingRefund: amount => `${amount} credits are still due for a refund. They will be deducted as credits are added or released from hold.`,
    transactions: "Credit history", transactionNote: "Get 100 credits when you sign up. On both Free and Plus, 100 credits unlock a writing set. You can reopen it anytime and get up to 20 AI reviews per question.",
    balanceAfter: "Remaining credits", reservedAfter: "Credits on hold", result: "View evaluation", history: "My evaluations",
    empty: "No credit activity yet.", loading: "Loading your credits…",
    error: "Unable to load your credits. Please try again shortly.", retry: "Try again", refresh: "Refresh",
    loginRequired: "Sign in to view your credit history.", previous: "Previous", next: "Next", page: "Page",
    buy: (credits, amount) => `Buy ${credits} credits · ₩${amount}`, checkAgain: "Check payment status",
    cardIssuerNotice: "Please use a card issued outside South Korea.",
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
    kinds: { grant: "Granted", reserve: "On hold", capture: "Charged", release: "Released", welcome: "Signup bonus", unlock: "Set access", purchase: "Credit purchase", plan_bonus: "Plan bonus", refund: "Refund deduction", restore: "Refund reversal" },
  },
  id: {
    title: "Kredit",
    available: "Tersedia", balance: "Total saldo", reserved: "Ditahan", unit: "kredit",
    pendingRefund: amount => `Masih ada ${amount} kredit yang perlu dipotong karena pengembalian dana. Kredit akan dipotong saat saldo bertambah atau kredit yang ditahan dilepas.`,
    transactions: "Riwayat kredit", transactionNote: "Dapatkan 100 kredit saat mendaftar. Pengguna Free dan Plus menggunakan 100 kredit untuk membuka satu paket menulis. Paket dapat dibuka kembali kapan saja dan mencakup hingga 20 ulasan AI per soal.",
    balanceAfter: "Sisa kredit", reservedAfter: "Kredit ditahan", result: "Lihat penilaian", history: "Riwayat penilaian saya",
    empty: "Belum ada riwayat kredit.", loading: "Memuat informasi kredit…",
    error: "Informasi kredit tidak dapat dimuat. Silakan coba lagi sebentar.", retry: "Coba lagi", refresh: "Muat ulang",
    loginRequired: "Masuk untuk melihat riwayat kredit Anda.", previous: "Sebelumnya", next: "Berikutnya", page: "Halaman",
    buy: (credits, amount) => `Beli ${credits} kredit · ₩${amount}`, checkAgain: "Periksa status pembayaran",
    cardIssuerNotice: "Gunakan kartu yang diterbitkan di luar Korea Selatan.",
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
    kinds: { grant: "Diberikan", reserve: "Ditahan", capture: "Dipotong", release: "Dilepas", welcome: "Bonus pendaftaran", unlock: "Akses paket", purchase: "Pembelian kredit", plan_bonus: "Bonus paket", refund: "Potongan pengembalian dana", restore: "Pemulihan kredit" },
  },
};
