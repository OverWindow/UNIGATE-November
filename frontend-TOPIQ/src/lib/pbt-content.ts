import type { Language } from "./landing-content";

const ko = {
  title: "나의 속도로 연습하고, 실전처럼 도전하세요.", intro: "영역과 응시 방식을 선택하세요. 한 세트는 50문항, 100점 만점입니다.",
  reading: "읽기", listening: "듣기", practice: "연습", timed: "실전", unlimited: "시간 제한 없음",
  practiceHint: "충분히 생각하고 자유롭게 풀어보세요.", timedHint: "듣기 60분 · 읽기 70분. 시간이 끝나면 자동 제출됩니다.",
  guestNote: "비회원도 읽기 3세트 + 듣기 3세트, 총 300문제를 풀 수 있어요. 로그인하면 공개된 모든 세트를 이용할 수 있습니다.",
  guestHistory: "비회원 응시 기록은 이 브라우저 세션에서만 확인할 수 있습니다. 쿠키 삭제·만료 또는 로그아웃 시 접근할 수 없게 됩니다.",
  memberNote: "공개된 모든 모의고사를 이용할 수 있습니다.", free: "비회원 공개", members: "회원 전용", round: "세트", questions: "문항", minutes: "분",
  start: "응시 시작", login: "로그인하고 응시", loading: "불러오는 중…", retry: "다시 시도", empty: "아직 공개된 모의고사가 없습니다.",
  history: "최근 응시 기록", noHistory: "첫 모의고사를 시작해 보세요.", resume: "이어풀기", result: "결과 보기", inProgress: "진행 중", submitted: "제출 완료",
  back: "모의고사 목록", answered: "답한 문항", navigator: "답안표", previous: "이전", next: "다음", submit: "답안 제출", submitting: "제출 중…",
  allQuestions: "전체 문제", currentQuestion: "현재 문항", questionNavigation: "문항 이동", remainingTime: "남은 시간", close: "닫기",
  saved: "답안이 저장되었습니다", saving: "답안 저장 중…", saveFailed: "저장하지 못했습니다. 선택이 되돌려졌습니다. 답안을 다시 선택해 주세요.",
  saveHint: "선택한 답안은 자동 저장됩니다. 제출 후 정답과 해설을 확인할 수 있습니다.",
  audioHint: "음원은 자유롭게 재생·일시정지·반복할 수 있습니다.", audioError: "음원을 불러오지 못했습니다. 연결을 확인하고 다시 시도해 주세요.",
  timeHint: "화면을 닫아도 실전 시험 시간은 계속 흐릅니다.", confirm: "답안을 제출할까요? 제출 후에는 수정할 수 없습니다.", unanswered: "미응답 문항", cancel: "계속 풀기",
  expired: "시험 시간이 종료되었습니다. 저장된 답안을 제출합니다.", submitFailed: "제출 결과를 확인하지 못했습니다. 다시 시도하면 안전하게 결과를 확인할 수 있습니다.",
  complete: "모의고사를 마쳤습니다", score: "점수", correct: "정답", incorrect: "오답", review: "문항별 해설", all: "전체 문항", wrongOnly: "오답·미응답", noWrong: "모든 문항을 맞혔습니다!",
  yourAnswer: "내 답안", noAnswer: "미응답", explanation: "해설", transcript: "듣기 대본", clear: "선택 해제", group: "공통 지문", choice: "선택지", material: "문제 자료", timedOut: "시간 종료로 제출되었습니다.",
  error: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", unavailable: "모의고사를 준비 중입니다. 잠시 후 다시 확인해 주세요.",
  notFound: "이 응시 기록에 접근할 수 없습니다. 응시한 계정 또는 브라우저 세션을 확인해 주세요.", loginRequired: "이 세트는 로그인 후 이용할 수 있습니다.", notReady: "이 세트의 문제 또는 미디어를 준비 중입니다. 다른 세트를 선택해 주세요.", rateLimited: "응시 시작 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
};
type Copy = { [K in keyof typeof ko]: string };
export const pbtContent: Record<Language, Copy> = {
  ko,
  en: {
    title: "Practice at your pace. Prepare for test day.", intro: "Choose a section and mode. Each set has 50 questions worth 100 points.",
    reading: "Reading", listening: "Listening", practice: "Practice", timed: "Timed", unlimited: "No time limit",
    practiceHint: "Take your time and work at your own pace.", timedHint: "Listening: 60 min · Reading: 70 min. Answers submit when time runs out.",
    guestNote: "Try 3 reading and 3 listening sets without an account — 300 questions. Sign in to access all published sets.",
    guestHistory: "Guest attempts belong to this browser session. Clearing cookies, session expiry or signing out removes access.", memberNote: "You have access to all published mock tests.",
    free: "Guest access", members: "Members", round: "Set", questions: "questions", minutes: "min", start: "Start test", login: "Sign in to start", loading: "Loading…", retry: "Try again", empty: "No mock tests are published yet.",
    history: "Recent attempts", noHistory: "Start your first mock test.", resume: "Continue", result: "View results", inProgress: "In progress", submitted: "Submitted",
    back: "All mock tests", answered: "Answered", navigator: "Answer sheet", previous: "Previous", next: "Next", submit: "Submit answers", submitting: "Submitting…",
    allQuestions: "All questions", currentQuestion: "Current question", questionNavigation: "Question navigation", remainingTime: "Time left", close: "Close",
    saved: "Answers saved", saving: "Saving…", saveFailed: "Could not save. Your selection was reverted. Please select your answer again.", saveHint: "Answers save automatically. Answers and explanations appear after submission.",
    audioHint: "You can replay, pause and seek freely.", audioError: "Could not load audio. Check your connection and try again.", timeHint: "The timed test continues even when you close this page.",
    confirm: "Submit your answers? You cannot change them afterwards.", unanswered: "Unanswered", cancel: "Keep working", expired: "Time is up. Submitting saved answers.", submitFailed: "Submission could not be confirmed. Retry safely to check your result.",
    complete: "Mock test complete", score: "Score", correct: "Correct", incorrect: "Incorrect", review: "Question review", all: "All questions", wrongOnly: "Incorrect & unanswered", noWrong: "You answered every question correctly!",
    yourAnswer: "Your answer", noAnswer: "Unanswered", explanation: "Explanation", transcript: "Listening transcript", clear: "Clear selection", group: "Shared passage", choice: "Option", material: "Question material", timedOut: "Submitted when time ran out.",
    error: "Could not process the request. Please try again.", unavailable: "Mock tests are being prepared. Please check again soon.", notFound: "This attempt is unavailable. Check the account or browser session you used.", loginRequired: "Sign in to access this set.", notReady: "Questions or media for this set are not ready. Please choose another set.", rateLimited: "Too many test starts. Please try again later.",
  },
  id: {
    title: "Berlatih sesuai ritmemu. Bersiap untuk ujian.", intro: "Pilih bidang dan mode. Setiap set berisi 50 soal dengan nilai maksimal 100.",
    reading: "Membaca", listening: "Menyimak", practice: "Latihan", timed: "Simulasi", unlimited: "Tanpa batas waktu",
    practiceHint: "Pahami dan kerjakan soal dengan tenang.", timedHint: "Menyimak 60 menit · Membaca 70 menit. Jawaban dikirim saat waktu habis.",
    guestNote: "Tanpa akun, tersedia 3 set membaca dan 3 set menyimak — total 300 soal. Masuk untuk mengakses semua set yang dipublikasikan.",
    guestHistory: "Riwayat tamu hanya tersedia dalam sesi browser ini. Menghapus cookie, sesi berakhir, atau keluar akan menghilangkan akses.", memberNote: "Anda dapat mengakses semua simulasi yang dipublikasikan.",
    free: "Akses tamu", members: "Khusus anggota", round: "Set", questions: "soal", minutes: "menit", start: "Mulai ujian", login: "Masuk untuk mulai", loading: "Memuat…", retry: "Coba lagi", empty: "Belum ada simulasi yang dipublikasikan.",
    history: "Riwayat terbaru", noHistory: "Mulai simulasi pertama Anda.", resume: "Lanjutkan", result: "Lihat hasil", inProgress: "Sedang berlangsung", submitted: "Terkirim",
    back: "Daftar simulasi", answered: "Terjawab", navigator: "Lembar jawaban", previous: "Sebelumnya", next: "Berikutnya", submit: "Kirim jawaban", submitting: "Mengirim…",
    allQuestions: "Semua soal", currentQuestion: "Soal saat ini", questionNavigation: "Navigasi soal", remainingTime: "Sisa waktu", close: "Tutup",
    saved: "Jawaban tersimpan", saving: "Menyimpan…", saveFailed: "Gagal menyimpan. Pilihan dibatalkan. Silakan pilih kembali jawaban Anda.", saveHint: "Jawaban disimpan otomatis. Kunci dan pembahasan tersedia setelah dikirim.",
    audioHint: "Audio dapat diulang, dijeda, dan diputar bebas.", audioError: "Audio gagal dimuat. Periksa koneksi lalu coba lagi.", timeHint: "Waktu simulasi tetap berjalan meskipun halaman ditutup.",
    confirm: "Kirim jawaban? Jawaban tidak dapat diubah setelah dikirim.", unanswered: "Belum dijawab", cancel: "Lanjut mengerjakan", expired: "Waktu habis. Mengirim jawaban tersimpan.", submitFailed: "Pengiriman belum dapat dikonfirmasi. Coba lagi untuk memeriksa hasil dengan aman.",
    complete: "Simulasi selesai", score: "Nilai", correct: "Benar", incorrect: "Salah", review: "Pembahasan soal", all: "Semua soal", wrongOnly: "Salah & belum dijawab", noWrong: "Semua jawaban Anda benar!",
    yourAnswer: "Jawaban Anda", noAnswer: "Belum dijawab", explanation: "Pembahasan", transcript: "Transkrip audio", clear: "Hapus pilihan", group: "Teks bersama", choice: "Pilihan", material: "Materi soal", timedOut: "Dikirim saat waktu habis.",
    error: "Permintaan gagal diproses. Silakan coba lagi.", unavailable: "Simulasi sedang disiapkan. Silakan periksa kembali nanti.", notFound: "Riwayat ini tidak dapat diakses. Periksa akun atau sesi browser yang digunakan.", loginRequired: "Masuk untuk mengakses set ini.", notReady: "Soal atau media set ini belum siap. Silakan pilih set lain.", rateLimited: "Terlalu banyak permintaan mulai ujian. Coba lagi nanti.",
  },
};

export function pbtErrorMessage(error: unknown, t: Copy) {
  const code = error && typeof error === "object" && "code" in error ? error.code : "";
  if (code === "login_required") return t.loginRequired;
  if (code === "not_found") return t.notFound;
  if (code === "exam_not_ready") return t.notReady;
  if (code === "pbt_unavailable") return t.unavailable;
  if (code === "rate_limited") return t.rateLimited;
  return t.error;
}
