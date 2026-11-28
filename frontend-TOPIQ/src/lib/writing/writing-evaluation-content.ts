import type { Language } from "../landing-content";

interface Copy {
  answer: string; evaluate: string; history: string;
  unavailable: string; loading: string; processing: string; succeeded: string; failed: string;
  check: string; uncertain: string; retrySame: string; empty: string; result: string; original: string;
  tasks: string; corrections: string; review: string; next: string;
  previous: string; count: string; savedQuestion: string;
  processingShort: string; close: string; totalScore: string; points: string; details: string;
  reviewing: string; reviewHints: Record<"blanks" | "data" | "essay", [string, string]>; historyHint: string;
  before: string; after: string; viewResult: string; applyCorrection: string; undoCorrection: string; correctedAnswer: string;
  login: string; loginNotice: string;
  answerFormat: string; plainFormat: string; manuscriptFormat: string;
  errors: Record<string, string>;
  scoreLabels: Record<string, string>; shortScoreLabels: Record<string, string>; taskStatuses: Record<string, string>;
}

export const evaluationContent: Record<Language, Copy> = {
  ko: {
    scoreLabels: { a: "㉠", b: "㉡", content: "내용 및 수행 과제", organization: "글의 전개 구조", language: "언어 사용" },
    shortScoreLabels: { a: "㉠", b: "㉡", content: "내용 과제", organization: "구성", language: "언어" },
    taskStatuses: { "충족": "충족", "부분 충족": "부분 충족", "미충족": "미충족" },
    answerFormat: "답안 입력 형식", plainFormat: "일반", manuscriptFormat: "원고지",
    answer: "내 답안", evaluate: "평가 요청", history: "내 평가 이력",
    unavailable: "이 문항은 아직 평가를 이용할 수 없습니다.", loading: "불러오는 중입니다.",
    processing: "평가 중입니다. 결과는 평가 이력에서도 확인할 수 있습니다.", succeeded: "평가 완료", failed: "평가 실패 · 횟수 미차감",
    check: "처리 상태 확인", uncertain: "접수 또는 완료 여부를 확인하지 못했습니다. 상태를 확인하거나 같은 요청으로 다시 시도하세요.",
    retrySame: "같은 요청 다시 확인", empty: "아직 내역이 없습니다.", result: "평가 결과", original: "제출한 원본 답안",
    tasks: "과제 수행", corrections: "수정 제안", review: "검토 사항",
    next: "다음", previous: "이전",
    count: "공백 포함 · 줄바꿈 제외", savedQuestion: "제출 당시 문제",
    processingShort: "평가 중…", close: "닫기", totalScore: "총점", points: "점", details: "상세히 보기",
    reviewing: "답안을 살펴보고 있어요",
    reviewHints: {
      blanks: ["빈칸에 쓴 말이 앞뒤 내용과 잘 이어지는지 봐요.", "문법과 말투가 문장에 잘 맞는지 살펴봐요."],
      data: ["자료의 주요 내용이 글에 잘 담겼는지 봐요.", "수치와 특징을 정확하게 설명했는지 살펴봐요."],
      essay: ["글에서 주장하려는 바가 분명한지 봐요.", "이유와 예시가 주장을 잘 뒷받침하는지 살펴봐요."],
    },
    historyHint: "결과는 ‘내 평가 이력’에서도 확인할 수 있어요.",
    applyCorrection: "수정", undoCorrection: "되돌리기", correctedAnswer: "수정 미리보기",
    before: "수정 전", after: "수정 제안", viewResult: "평가 결과 보기",
    login: "로그인", loginNotice: "로그인 후 열람한 세트의 쓰기 평가를 이용할 수 있습니다.",
    errors: {
      set_locked: "먼저 세트를 열어 주세요.", evaluation_limit_reached: "이 문항은 평가 한도 20회에 도달해 더 이상 평가를 요청할 수 없습니다.",
      insufficient_credits: "크레딧이 부족해요", price_changed: "평가 조건이 변경됐습니다. 새 조건을 확인한 뒤 다시 요청하세요.",
      evaluation_busy: "다른 평가가 진행 중입니다. 잠시 후 다시 요청하세요.", rate_limited: "요청이 많습니다. 잠시 후 다시 시도하세요.",
      evaluation_unavailable: "평가 서비스가 아직 준비되지 않았습니다.", question_unavailable: "문항 형식을 확인해야 해 평가할 수 없습니다.",
      invalid_submission: "답안 형식과 최대 길이를 확인해 주세요.", not_found: "저장된 평가 또는 문제를 찾지 못했습니다.",
      authentication_required: "다시 로그인해 주세요.", default: "불러오지 못했습니다. 잠시 후 다시 확인해 주세요.",
    },
  },
  en: {
    scoreLabels: { a: "㉠", b: "㉡", content: "Content and task fulfillment", organization: "Organization", language: "Language use" },
    shortScoreLabels: { a: "㉠", b: "㉡", content: "Content", organization: "Structure", language: "Language" },
    taskStatuses: { "충족": "Met", "부분 충족": "Partially met", "미충족": "Not met" },
    answerFormat: "Answer format", plainFormat: "Plain", manuscriptFormat: "Manuscript",
    answer: "Your answer", evaluate: "Request evaluation", history: "My evaluations",
    unavailable: "Evaluation is not yet available for this question.", loading: "Loading…",
    processing: "Evaluation in progress. You can also check your history.", succeeded: "Completed", failed: "Evaluation failed · No attempt used",
    check: "Check status", uncertain: "Receipt or completion could not be confirmed. Check the status or retry the same request.",
    retrySame: "Retry the same request", empty: "No records yet.", result: "Evaluation result", original: "Submitted answer",
    tasks: "Task completion", corrections: "Suggested corrections", review: "Review notes",
    next: "Next", previous: "Previous",
    count: "Including spaces, excluding line breaks", savedQuestion: "Question at submission",
    processingShort: "Evaluating…", close: "Close", totalScore: "Total score", points: "points", details: "View details",
    reviewing: "We’re reviewing your answer",
    reviewHints: {
      blanks: ["We’re checking how your words fit the surrounding text.", "We’re checking whether the grammar and tone fit the sentence."],
      data: ["We’re checking how well your answer covers the main points in the data.", "We’re checking how accurately you describe the figures and key features."],
      essay: ["We’re checking how clearly you state your argument.", "We’re looking at how your reasons and examples support your argument."],
    },
    historyHint: "You can also find your result in “My evaluations”.",
    applyCorrection: "Apply", undoCorrection: "Undo", correctedAnswer: "Correction preview",
    before: "Before", after: "Suggested change", viewResult: "View evaluation result",
    login: "Sign in", loginNotice: "Sign in to evaluate answers in sets you have opened.",
    errors: {
      set_locked: "Open this set first.", evaluation_limit_reached: "This question has reached the limit of 20 evaluations. No further evaluations can be requested.",
      insufficient_credits: "You do not have enough available credits.", price_changed: "Evaluation terms changed. Review the updated terms before submitting again.",
      evaluation_busy: "Another evaluation is in progress. Please try again shortly.", rate_limited: "Too many requests. Please try again later.",
      evaluation_unavailable: "Evaluation is not configured yet.", question_unavailable: "The question format needs to be checked.",
      invalid_submission: "Check the answer format and maximum length.", not_found: "The saved evaluation or question could not be found.",
      authentication_required: "Please sign in again.", default: "Unable to load. Please try again.",
    },
  },
  id: {
    scoreLabels: { a: "㉠", b: "㉡", content: "Isi dan pemenuhan tugas", organization: "Struktur tulisan", language: "Penggunaan bahasa" },
    shortScoreLabels: { a: "㉠", b: "㉡", content: "Isi", organization: "Struktur", language: "Bahasa" },
    taskStatuses: { "충족": "Terpenuhi", "부분 충족": "Sebagian terpenuhi", "미충족": "Belum terpenuhi" },
    answerFormat: "Format jawaban", plainFormat: "Biasa", manuscriptFormat: "Kertas kotak",
    answer: "Jawaban Anda", evaluate: "Minta penilaian", history: "Riwayat penilaian",
    unavailable: "Penilaian belum tersedia untuk soal ini.", loading: "Memuat…",
    processing: "Penilaian berlangsung. Hasil juga tersedia di riwayat.", succeeded: "Selesai", failed: "Penilaian gagal · Jatah tidak berkurang",
    check: "Periksa status", uncertain: "Penerimaan atau penyelesaian belum dapat dipastikan. Periksa status atau ulangi permintaan yang sama.",
    retrySame: "Ulangi permintaan yang sama", empty: "Belum ada riwayat.", result: "Hasil penilaian", original: "Jawaban yang dikirim",
    tasks: "Pemenuhan tugas", corrections: "Saran perbaikan", review: "Catatan tinjauan",
    next: "Berikutnya", previous: "Sebelumnya",
    count: "Termasuk spasi, tanpa baris baru", savedQuestion: "Soal saat dikirim",
    processingShort: "Menilai…", close: "Tutup", totalScore: "Skor total", points: "poin", details: "Lihat detail",
    reviewing: "Kami sedang menilai jawaban Anda",
    reviewHints: {
      blanks: ["Kami memeriksa apakah isian Anda sesuai dengan teks di sekitarnya.", "Kami memeriksa apakah tata bahasa dan gaya bahasa Anda sesuai dengan kalimatnya."],
      data: ["Kami melihat apakah tulisan Anda memuat informasi utama dari data.", "Kami memeriksa ketepatan uraian Anda tentang angka dan ciri utama data."],
      essay: ["Kami melihat apakah pendapat Anda disampaikan dengan jelas.", "Kami melihat bagaimana alasan dan contoh mendukung pendapat Anda."],
    },
    historyHint: "Anda juga bisa melihat hasilnya di “Riwayat penilaian”.",
    applyCorrection: "Perbaiki", undoCorrection: "Urungkan", correctedAnswer: "Pratinjau perbaikan",
    before: "Sebelum", after: "Saran perubahan", viewResult: "Lihat hasil penilaian",
    login: "Masuk", loginNotice: "Masuk untuk menilai jawaban pada paket yang sudah dibuka.",
    errors: {
      set_locked: "Buka paket ini terlebih dahulu.", evaluation_limit_reached: "Soal ini telah mencapai batas 20 penilaian. Penilaian tambahan tidak dapat diminta.",
      insufficient_credits: "Kredit yang tersedia tidak cukup.", price_changed: "Ketentuan penilaian berubah. Periksa ketentuan terbaru sebelum mengirim ulang.",
      evaluation_busy: "Penilaian lain sedang berlangsung. Coba lagi sebentar.", rate_limited: "Terlalu banyak permintaan. Coba lagi nanti.",
      evaluation_unavailable: "Layanan penilaian belum disiapkan.", question_unavailable: "Format soal perlu diperiksa.",
      invalid_submission: "Periksa format dan panjang maksimum jawaban.", not_found: "Penilaian atau soal tidak ditemukan.",
      authentication_required: "Silakan masuk kembali.", default: "Tidak dapat memuat. Silakan coba lagi.",
    },
  },
};

export function answerLength(value: string): number {
  return Array.from(value.replace(/\r\n?/g, "\n").replace(/\n/g, "")).length;
}
