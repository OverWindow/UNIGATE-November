import type { Language } from "./landing-content";

const ko = {
  title: "TOPIK 단어장", intro: "급수에 맞는 단어를 약 20개씩, 뜻과 예문으로 살펴보세요.",
  vocabulary: "단어장", level: "급", words: "개 단어", sets: "개 세트", levelLabel: "급수 선택",
  browse: "단어 보기", loading: "단어장을 불러오는 중입니다.", empty: "이 급수의 단어장을 준비하고 있습니다.",
  error: "단어장을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", notFound: "요청한 세트 또는 페이지를 찾을 수 없습니다.",
  retry: "다시 시도", back: "세트 목록", previous: "이전", next: "다음", pagination: "세트 목록 페이지",
  meaningLanguage: "뜻 언어", showMeaning: "뜻과 예문 보기", hideMeaning: "뜻과 예문 접기",
  meaning: "뜻", example: "예문", englishExample: "영어 번역", wordList: "세트의 전체 단어",
  missingMeaning: "이 언어의 뜻은 아직 등록되지 않았습니다.",
  currentWord: "현재 단어", firstWord: "처음으로", lastWord: "마지막 단어입니다.",
};
type VocabularyCopy = { [Key in keyof typeof ko]: string };

export const vocabularyContent: Record<Language, VocabularyCopy> = {
  ko,
  en: {
    title: "Your Korean starts with a word.", intro: "Explore words for your level in sets of about 20, with meanings and examples.",
    vocabulary: "Vocabulary", level: "Level", words: "words", sets: "sets", levelLabel: "Choose a level",
    browse: "View words", loading: "Loading vocabulary…", empty: "Vocabulary sets for this level are coming soon.",
    error: "We couldn't load the vocabulary. Please try again shortly.", notFound: "This set or page could not be found.",
    retry: "Try again", back: "All sets", previous: "Previous", next: "Next", pagination: "Vocabulary pages",
    meaningLanguage: "Meaning language", showMeaning: "Show meaning and example", hideMeaning: "Hide meaning and example",
    meaning: "Meaning", example: "Example", englishExample: "English translation", wordList: "Words in this set",
    missingMeaning: "The meaning in this language is not available yet.",
    currentWord: "Current word", firstWord: "Back to first word", lastWord: "This is the last word.",
  },
  id: {
    title: "Bahasa Korea dimulai dari satu kata.", intro: "Pelajari kata sesuai level dalam set berisi sekitar 20 kata, dengan arti dan contoh.",
    vocabulary: "Kosakata", level: "Level", words: "kata", sets: "set", levelLabel: "Pilih level",
    browse: "Lihat kata", loading: "Memuat kosakata…", empty: "Set kosakata untuk level ini sedang disiapkan.",
    error: "Kosakata tidak dapat dimuat. Silakan coba lagi sebentar lagi.", notFound: "Set atau halaman ini tidak ditemukan.",
    retry: "Coba lagi", back: "Semua set", previous: "Sebelumnya", next: "Berikutnya", pagination: "Halaman kosakata",
    meaningLanguage: "Bahasa arti", showMeaning: "Lihat arti dan contoh", hideMeaning: "Sembunyikan arti dan contoh",
    meaning: "Arti", example: "Contoh", englishExample: "Terjemahan bahasa Inggris", wordList: "Kata dalam set ini",
    missingMeaning: "Arti dalam bahasa ini belum tersedia.",
    currentWord: "Kata saat ini", firstWord: "Kembali ke kata pertama", lastWord: "Ini kata terakhir.",
  },
};

export function vocabularyLevelLabel(level: number, language: Language) {
  return language === "ko" ? `${level}급` : `Level ${level}`;
}
