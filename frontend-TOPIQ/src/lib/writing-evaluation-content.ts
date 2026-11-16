import type { Language } from "./landing-content";

interface Copy {
  answer: string; evaluate: string; history: string; credits: string; available: string; reserved: string;
  cost: string; unavailable: string; loading: string; processing: string; succeeded: string; failed: string;
  check: string; uncertain: string; retrySame: string; empty: string; result: string; original: string;
  tasks: string; corrections: string; review: string; charged: string; transactions: string; next: string;
  previous: string; blankFree: string; count: string; savedQuestion: string; back: string;
  errors: Record<string, string>; kinds: Record<string, string>;
}

export const evaluationContent: Record<Language, Copy> = {
  ko: {
    answer: "내 답안", evaluate: "평가 요청", history: "내 평가 이력", credits: "크레딧", available: "사용 가능", reserved: "예약 중",
    cost: "이번 평가", unavailable: "이 문항은 아직 평가를 이용할 수 없습니다.", loading: "불러오는 중입니다.",
    processing: "평가 중입니다. 결과는 평가 이력에서도 확인할 수 있습니다.", succeeded: "평가 완료", failed: "평가 실패 · 크레딧 미차감",
    check: "처리 상태 확인", uncertain: "접수 또는 완료 여부를 확인하지 못했습니다. 상태를 확인하거나 같은 요청으로 다시 시도하세요.",
    retrySame: "같은 요청 다시 확인", empty: "아직 내역이 없습니다.", result: "평가 결과", original: "제출한 원본 답안",
    tasks: "과제 수행", corrections: "수정 제안", review: "검토 사항", charged: "사용 크레딧", transactions: "크레딧 거래 내역",
    next: "다음", previous: "이전", blankFree: "완전 미응답은 모델 호출 없이 0점으로 기록되며 크레딧이 차감되지 않습니다.",
    count: "공백 포함 · 줄바꿈 제외", savedQuestion: "제출 당시 문제", back: "쓰기 세트",
    errors: {
      insufficient_credits: "사용 가능한 크레딧이 부족합니다.", price_changed: "평가 조건이 변경됐습니다. 새 차감량을 확인한 뒤 다시 요청하세요.",
      evaluation_busy: "다른 평가가 진행 중입니다. 잠시 후 다시 요청하세요.", rate_limited: "요청이 많습니다. 잠시 후 다시 시도하세요.",
      evaluation_unavailable: "평가 서비스가 아직 준비되지 않았습니다.", question_unavailable: "문항 형식을 확인해야 해 평가할 수 없습니다.",
      invalid_submission: "답안 형식과 최대 길이를 확인해 주세요.", not_found: "저장된 평가 또는 문제를 찾지 못했습니다.",
      authentication_required: "다시 로그인해 주세요.", default: "불러오지 못했습니다. 잠시 후 다시 확인해 주세요.",
    }, kinds: { grant: "지급", reserve: "예약", capture: "차감", release: "예약 해제" },
  },
  en: {
    answer: "Your answer", evaluate: "Request evaluation", history: "My evaluations", credits: "Credits", available: "Available", reserved: "Reserved",
    cost: "This evaluation", unavailable: "Evaluation is not yet available for this question.", loading: "Loading…",
    processing: "Evaluation in progress. You can also check your history.", succeeded: "Completed", failed: "Evaluation failed · No credits charged",
    check: "Check status", uncertain: "Receipt or completion could not be confirmed. Check the status or retry the same request.",
    retrySame: "Retry the same request", empty: "No records yet.", result: "Evaluation result", original: "Submitted answer",
    tasks: "Task completion", corrections: "Suggested corrections", review: "Review notes", charged: "Credits charged", transactions: "Credit transactions",
    next: "Next", previous: "Previous", blankFree: "An entirely blank answer is recorded as zero without a model call or credit charge.",
    count: "Including spaces, excluding line breaks", savedQuestion: "Question at submission", back: "Writing sets",
    errors: {
      insufficient_credits: "You do not have enough available credits.", price_changed: "Evaluation terms changed. Review the updated price before submitting again.",
      evaluation_busy: "Another evaluation is in progress. Please try again shortly.", rate_limited: "Too many requests. Please try again later.",
      evaluation_unavailable: "Evaluation is not configured yet.", question_unavailable: "The question format needs to be checked.",
      invalid_submission: "Check the answer format and maximum length.", not_found: "The saved evaluation or question could not be found.",
      authentication_required: "Please sign in again.", default: "Unable to load. Please try again.",
    }, kinds: { grant: "Granted", reserve: "Reserved", capture: "Charged", release: "Released" },
  },
  id: {
    answer: "Jawaban Anda", evaluate: "Minta penilaian", history: "Riwayat penilaian", credits: "Kredit", available: "Tersedia", reserved: "Dicadangkan",
    cost: "Penilaian ini", unavailable: "Penilaian belum tersedia untuk soal ini.", loading: "Memuat…",
    processing: "Penilaian berlangsung. Hasil juga tersedia di riwayat.", succeeded: "Selesai", failed: "Penilaian gagal · Kredit tidak dipotong",
    check: "Periksa status", uncertain: "Penerimaan atau penyelesaian belum dapat dipastikan. Periksa status atau ulangi permintaan yang sama.",
    retrySame: "Ulangi permintaan yang sama", empty: "Belum ada riwayat.", result: "Hasil penilaian", original: "Jawaban yang dikirim",
    tasks: "Pemenuhan tugas", corrections: "Saran perbaikan", review: "Catatan tinjauan", charged: "Kredit terpakai", transactions: "Riwayat transaksi kredit",
    next: "Berikutnya", previous: "Sebelumnya", blankFree: "Jawaban kosong dicatat dengan nilai nol tanpa panggilan model atau pemotongan kredit.",
    count: "Termasuk spasi, tanpa baris baru", savedQuestion: "Soal saat dikirim", back: "Paket menulis",
    errors: {
      insufficient_credits: "Kredit yang tersedia tidak cukup.", price_changed: "Ketentuan penilaian berubah. Periksa biaya terbaru sebelum mengirim ulang.",
      evaluation_busy: "Penilaian lain sedang berlangsung. Coba lagi sebentar.", rate_limited: "Terlalu banyak permintaan. Coba lagi nanti.",
      evaluation_unavailable: "Layanan penilaian belum disiapkan.", question_unavailable: "Format soal perlu diperiksa.",
      invalid_submission: "Periksa format dan panjang maksimum jawaban.", not_found: "Penilaian atau soal tidak ditemukan.",
      authentication_required: "Silakan masuk kembali.", default: "Tidak dapat memuat. Silakan coba lagi.",
    }, kinds: { grant: "Diberikan", reserve: "Dicadangkan", capture: "Dipotong", release: "Dilepas" },
  },
};

export function answerLength(value: string): number {
  return Array.from(value.replace(/\r\n?/g, "\n").replace(/\n/g, "")).length;
}
