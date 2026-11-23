import type { Language } from "@/lib/landing-content";

type Copy = Record<Language, { title: string; description: string }>;

export const seoCopy = {
  home: {
    ko: { title: "TOPIQ | TOPIK II 학습", description: "TOPIK II PBT·IBT 모의고사, AI 쓰기 튜터, 단어장과 단어 퀴즈로 한국어를 학습하세요." },
    en: { title: "TOPIQ | Study for TOPIK II", description: "Prepare for TOPIK II with PBT and IBT practice exams, an AI writing tutor, vocabulary sets, and quizzes." },
    id: { title: "TOPIQ | Belajar TOPIK II", description: "Persiapkan TOPIK II dengan simulasi PBT dan IBT, tutor menulis AI, daftar kosakata, dan kuis." },
  },
  pbt: {
    ko: { title: "TOPIK II PBT 모의고사 | TOPIQ", description: "TOPIK II 지필 모의고사를 실전 또는 연습 모드로 풀고 결과를 확인하세요." },
    en: { title: "TOPIK II PBT Practice Exams | TOPIQ", description: "Take TOPIK II paper based practice exams in test or practice mode and review your results." },
    id: { title: "Simulasi TOPIK II PBT | TOPIQ", description: "Kerjakan simulasi TOPIK II berbasis kertas dalam mode ujian atau latihan dan lihat hasilnya." },
  },
  ibt: {
    ko: { title: "TOPIK II IBT 모의고사 | TOPIQ", description: "TOPIK II 인터넷 기반 모의고사를 실전 또는 연습 모드로 풀고 결과를 확인하세요." },
    en: { title: "TOPIK II IBT Practice Exams | TOPIQ", description: "Take TOPIK II internet based practice exams in test or practice mode and review your results." },
    id: { title: "Simulasi TOPIK II IBT | TOPIQ", description: "Kerjakan simulasi TOPIK II berbasis internet dalam mode ujian atau latihan dan lihat hasilnya." },
  },
  vocabulary: {
    ko: { title: "TOPIK 단어장 | TOPIQ", description: "TOPIK 3~6급 단어의 뜻과 예문을 살펴보고 단어 퀴즈로 복습하세요." },
    en: { title: "TOPIK Vocabulary Sets | TOPIQ", description: "Study TOPIK level 3 to 6 words with meanings and examples, then review them with vocabulary quizzes." },
    id: { title: "Daftar Kosakata TOPIK | TOPIQ", description: "Pelajari kosakata TOPIK tingkat 3 hingga 6 dengan arti dan contoh, lalu ulangi dengan kuis." },
  },
  vocabularySet: {
    ko: { title: "TOPIK 단어와 예문 | TOPIQ", description: "TOPIK 단어의 뜻과 예문을 학습하세요." },
    en: { title: "TOPIK Words and Examples | TOPIQ", description: "Study TOPIK vocabulary with meanings and example sentences." },
    id: { title: "Kata dan Contoh TOPIK | TOPIQ", description: "Pelajari kosakata TOPIK beserta arti dan contoh kalimat." },
  },
  vocabularyQuiz: {
    ko: { title: "TOPIK 단어 퀴즈 | TOPIQ", description: "문장 빈칸 퀴즈로 TOPIK 단어를 복습하세요." },
    en: { title: "TOPIK Vocabulary Quiz | TOPIQ", description: "Review TOPIK vocabulary with sentence fill in the blank quizzes." },
    id: { title: "Kuis Kosakata TOPIK | TOPIQ", description: "Ulangi kosakata TOPIK melalui kuis melengkapi kalimat." },
  },
  writing: {
    ko: { title: "AI 쓰기 튜터 | TOPIQ", description: "TOPIK II PBT 쓰기 51~54번 문제를 세트별로 살펴보세요." },
    en: { title: "AI Writing Tutor | TOPIQ", description: "Practice TOPIK II PBT writing questions 51 to 54 with an AI writing tutor." },
    id: { title: "Tutor Menulis AI | TOPIQ", description: "Latih soal menulis TOPIK II PBT nomor 51 hingga 54 dengan tutor menulis AI." },
  },
  writingSet: {
    ko: { title: "TOPIK II 쓰기 문제 | TOPIQ", description: "TOPIK II PBT 쓰기 문제를 풀고 AI 첨삭을 받아보세요." },
    en: { title: "TOPIK II Writing Questions | TOPIQ", description: "Practice TOPIK II PBT writing questions and get AI feedback." },
    id: { title: "Soal Menulis TOPIK II | TOPIQ", description: "Latih soal menulis TOPIK II PBT dan dapatkan umpan balik AI." },
  },
  plans: {
    ko: { title: "Plus 요금제 | TOPIQ", description: "TOPIQ Plus 요금제와 무료 요금제를 비교하고 학습 혜택을 확인하세요." },
    en: { title: "Plus Plans | TOPIQ", description: "Compare TOPIQ Plus and Free plans and explore learning benefits." },
    id: { title: "Paket Plus | TOPIQ", description: "Bandingkan paket TOPIQ Plus dan Free serta manfaat belajarnya." },
  },
  privacy: {
    ko: { title: "개인정보 처리방침 | TOPIQ", description: "TOPIQ의 개인정보 처리 방법과 이용자의 권리를 안내합니다." },
    en: { title: "Privacy Policy | TOPIQ", description: "Learn how TOPIQ handles personal information and your privacy rights." },
    id: { title: "Kebijakan Privasi | TOPIQ", description: "Pelajari cara TOPIQ mengelola data pribadi dan hak privasi Anda." },
  },
  terms: {
    ko: { title: "서비스 이용약관 | TOPIQ", description: "TOPIQ 서비스 이용 조건과 이용자의 권리를 안내합니다." },
    en: { title: "Terms of Service | TOPIQ", description: "Read the conditions for using TOPIQ and your rights as a user." },
    id: { title: "Ketentuan Layanan | TOPIQ", description: "Baca ketentuan penggunaan TOPIQ dan hak Anda sebagai pengguna." },
  },
  licenses: {
    ko: { title: "오픈소스 라이선스 | TOPIQ", description: "TOPIQ에서 사용하는 오픈소스 소프트웨어와 사전 데이터의 출처 및 이용조건입니다." },
    en: { title: "Open Source Licenses | TOPIQ", description: "Sources and license terms for open source software and dictionary data used by TOPIQ." },
    id: { title: "Lisensi Sumber Terbuka | TOPIQ", description: "Sumber dan ketentuan lisensi perangkat lunak serta data kamus yang digunakan TOPIQ." },
  },
} satisfies Record<string, Copy>;
