import type { Language } from "./landing-content";

interface WritingCopy {
  title: string; intro: string; set: string; questions: string; open: string; notice: string;
  loading: string; empty: string; error: string; notFound: string; retry: string; back: string;
  question: string; navigation: string; previous: string; next: string; data: string;
  source: string; unit: string; category: string; types: Record<number, string>;
  submissionHistory: string; submitted: string; notSubmitted: string;
  viewQuestion: string; close: string;
  catalog: {
    history: string;
    steps: [string, string, string]; stepsLabel: string;
  };
}

export const writingContent: Record<Language, WritingCopy> = {
  ko: {
    viewQuestion: "{number}번 문제 보기", close: "닫기",
    title: "AI 쓰기 튜터",
    intro: "TOPIK II 쓰기를 연습하고, AI 평가와 첨삭으로 글을 다듬어 보세요.",
    set: "쓰기 세트", questions: "4문항 · 51–54번", open: "문제 풀기",
    submissionHistory: "제출 이력", submitted: "제출 이력 있음", notSubmitted: "제출 이력 없음",
    catalog: {
      history: "내 평가 기록",
      steps: ["문제 선택", "답안 작성", "AI 평가 확인"], stepsLabel: "쓰기 학습 순서",
    },
    notice: "AI 평가는 학습을 위한 참고 결과이며 공식 TOPIK 성적이 아닙니다. 평가 설명은 요청 시 선택한 화면 언어로, 수정 문장은 한국어로 제공됩니다.",
    loading: "쓰기 문제를 불러오고 있습니다.", empty: "아직 준비된 PBT 쓰기 세트가 없습니다.",
    error: "문제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", notFound: "이 쓰기 세트를 찾을 수 없습니다.",
    retry: "다시 시도", back: "세트 목록", question: "문항", navigation: "문항 이동", previous: "이전 문제", next: "다음 문제",
    data: "자료 수치 보기", source: "자료 출처", unit: "단위", category: "항목",
    types: { 51: "실용문 완성", 52: "설명문 완성", 53: "자료 설명", 54: "주제 글쓰기" },
  },
  en: {
    viewQuestion: "View question {number}", close: "Close",
    title: "AI Writing Tutor",
    intro: "Practice TOPIK II writing and refine your work with AI feedback and corrections.",
    set: "Writing set", questions: "4 questions · 51–54", open: "Practice now",
    submissionHistory: "Submissions", submitted: "Previously submitted", notSubmitted: "Not submitted yet",
    catalog: {
      history: "My evaluations",
      steps: ["Choose questions", "Write your answers", "Review AI feedback"], stepsLabel: "Writing practice steps",
    },
    notice: "AI evaluations support learning and are not official TOPIK scores. Feedback uses the page language selected when you submit. Corrected sentences remain in Korean.",
    loading: "Loading writing questions…", empty: "No PBT writing sets are available yet.",
    error: "Unable to load the questions. Please try again.", notFound: "This writing set could not be found.",
    retry: "Try again", back: "All sets", question: "Question", navigation: "Question navigation", previous: "Previous question", next: "Next question",
    data: "View data values", source: "Source", unit: "Unit", category: "Category",
    types: { 51: "Practical text", 52: "Explanatory text", 53: "Describing data", 54: "Essay writing" },
  },
  id: {
    viewQuestion: "Lihat soal {number}", close: "Tutup",
    title: "Tutor Menulis AI",
    intro: "Berlatih menulis TOPIK II dan sempurnakan tulisan dengan penilaian serta koreksi AI.",
    set: "Paket menulis", questions: "4 soal · 51–54", open: "Mulai latihan",
    submissionHistory: "Riwayat kiriman", submitted: "Pernah dikirim", notSubmitted: "Belum dikirim",
    catalog: {
      history: "Penilaian saya",
      steps: ["Pilih soal", "Tulis jawaban", "Lihat penilaian AI"], stepsLabel: "Langkah latihan menulis",
    },
    notice: "Penilaian AI membantu belajar dan bukan nilai resmi TOPIK. Penjelasan menggunakan bahasa halaman saat jawaban dikirim. Kalimat perbaikan tetap dalam bahasa Korea.",
    loading: "Memuat soal menulis…", empty: "Belum ada paket menulis PBT yang tersedia.",
    error: "Soal tidak dapat dimuat. Silakan coba lagi.", notFound: "Paket menulis ini tidak ditemukan.",
    retry: "Coba lagi", back: "Semua paket", question: "Soal", navigation: "Navigasi soal", previous: "Soal sebelumnya", next: "Soal berikutnya",
    data: "Lihat nilai data", source: "Sumber", unit: "Satuan", category: "Kategori",
    types: { 51: "Teks praktis", 52: "Teks penjelasan", 53: "Menjelaskan data", 54: "Menulis esai" },
  },
};
