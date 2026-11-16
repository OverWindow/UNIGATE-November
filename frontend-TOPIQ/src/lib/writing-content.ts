import type { Language } from "./landing-content";

interface WritingCopy {
  title: string; intro: string; set: string; questions: string; open: string; notice: string;
  loading: string; empty: string; error: string; notFound: string; retry: string; back: string;
  question: string; navigation: string; previous: string; next: string; data: string;
  source: string; unit: string; category: string; types: Record<number, string>;
}

export const writingContent: Record<Language, WritingCopy> = {
  ko: {
    title: "AI 쓰기 튜터", intro: "문장 완성부터 자료 설명과 주제 글쓰기까지, PBT 쓰기 문제를 차근차근 살펴보세요.",
    set: "쓰기 세트", questions: "4문항 · 51–54번", open: "문제 보기",
    notice: "현재는 문제 보기만 제공됩니다. 답안 입력·제출·채점은 준비 중입니다.",
    loading: "쓰기 문제를 불러오고 있습니다.", empty: "아직 준비된 PBT 쓰기 세트가 없습니다.",
    error: "문제를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", notFound: "이 쓰기 세트를 찾을 수 없습니다.",
    retry: "다시 시도", back: "세트 목록", question: "문항", navigation: "문항 이동", previous: "이전 문제", next: "다음 문제",
    data: "자료 수치 보기", source: "자료 출처", unit: "단위", category: "항목",
    types: { 51: "실용문 완성", 52: "설명문 완성", 53: "자료 설명", 54: "주제 글쓰기" },
  },
  en: {
    title: "AI Writing Tutor", intro: "Explore PBT writing, from completing sentences to describing data and writing an essay.",
    set: "Writing set", questions: "4 questions · 51–54", open: "View questions",
    notice: "Questions are available to view. Answer entry, submission and grading are coming later.",
    loading: "Loading writing questions…", empty: "No PBT writing sets are available yet.",
    error: "Unable to load the questions. Please try again.", notFound: "This writing set could not be found.",
    retry: "Try again", back: "All sets", question: "Question", navigation: "Question navigation", previous: "Previous question", next: "Next question",
    data: "View data values", source: "Source", unit: "Unit", category: "Category",
    types: { 51: "Practical text", 52: "Explanatory text", 53: "Describing data", 54: "Essay writing" },
  },
  id: {
    title: "Tutor Menulis AI", intro: "Pelajari soal menulis PBT, dari melengkapi kalimat hingga menjelaskan data dan menulis esai.",
    set: "Paket menulis", questions: "4 soal · 51–54", open: "Lihat soal",
    notice: "Saat ini hanya soal yang tersedia. Penulisan, pengiriman, dan penilaian jawaban akan hadir kemudian.",
    loading: "Memuat soal menulis…", empty: "Belum ada paket menulis PBT yang tersedia.",
    error: "Soal tidak dapat dimuat. Silakan coba lagi.", notFound: "Paket menulis ini tidak ditemukan.",
    retry: "Coba lagi", back: "Semua paket", question: "Soal", navigation: "Navigasi soal", previous: "Soal sebelumnya", next: "Soal berikutnya",
    data: "Lihat nilai data", source: "Sumber", unit: "Satuan", category: "Kategori",
    types: { 51: "Teks praktis", 52: "Teks penjelasan", 53: "Menjelaskan data", 54: "Menulis esai" },
  },
};
