import type { Language } from "./landing-content";

export type ExamFormat = "pbt" | "ibt";
export type ExamArea = "reading" | "writing";

interface ExamContent {
  formats: Record<ExamFormat, { label: string; description: string }>;
  eyebrow: string;
  title: string;
  description: string;
  area: string;
  round: string;
  emptyRounds: string;
  action: string;
  notice: string;
}

export const examContent: Record<Language, ExamContent> = {
  ko: {
    formats: {
      pbt: {
        label: "지필 시험",
        description: "TOPIK II PBT는 종이 문제지와 답안지를 사용하는 한국어능력시험입니다. 듣기·쓰기·읽기를 통해 중급·고급 한국어 능력을 평가하며, 쓰기 답안은 손으로 작성합니다.",
      },
      ibt: {
        label: "인터넷 기반 시험",
        description: "TOPIK II IBT는 시험장에서 컴퓨터로 문제를 확인하고 답안을 입력하는 한국어능력시험입니다. 듣기·읽기·쓰기를 통해 중급·고급 한국어 능력을 평가하며, 쓰기 답안은 키보드로 작성합니다.",
      },
    },
    eyebrow: "MOCK TEST",
    title: "모의고사 응시",
    description: "연습할 영역과 응시할 모의고사 회차를 선택하세요.",
    area: "응시 영역",
    round: "모의고사 회차",
    emptyRounds: "등록된 모의고사가 없습니다",
    action: "모의고사 준비 중",
    notice: "모의고사는 준비 중입니다. 현재는 실제 문제풀이·채점·응시 기록을 제공하지 않습니다.",
  },
  en: {
    formats: {
      pbt: {
        label: "Paper-based test",
        description: "TOPIK II PBT is a Korean proficiency test taken with paper question booklets and answer sheets. It assesses intermediate and advanced listening, writing, and reading skills, with writing answers completed by hand.",
      },
      ibt: {
        label: "Internet-based test",
        description: "TOPIK II IBT is a Korean proficiency test taken on a computer at a test center. It assesses intermediate and advanced listening, reading, and writing skills, with writing answers typed on a keyboard.",
      },
    },
    eyebrow: "MOCK TEST",
    title: "Take a mock test",
    description: "Choose the skill you want to practice and a mock test round.",
    area: "Test area",
    round: "Mock test round",
    emptyRounds: "No mock tests are available",
    action: "Mock tests coming soon",
    notice: "Mock tests are in development. Exercises, scoring, and test records are not available yet.",
  },
  id: {
    formats: {
      pbt: {
        label: "Ujian berbasis kertas",
        description: "TOPIK II PBT adalah ujian kemampuan bahasa Korea yang menggunakan buku soal dan lembar jawaban kertas. Ujian ini menilai kemampuan menyimak, menulis, dan membaca tingkat menengah hingga lanjut, dengan jawaban menulis ditulis tangan.",
      },
      ibt: {
        label: "Ujian berbasis internet",
        description: "TOPIK II IBT adalah ujian kemampuan bahasa Korea yang dikerjakan melalui komputer di pusat ujian. Ujian ini menilai kemampuan menyimak, membaca, dan menulis tingkat menengah hingga lanjut, dengan jawaban menulis diketik menggunakan papan ketik.",
      },
    },
    eyebrow: "SIMULASI UJIAN",
    title: "Ikuti simulasi ujian",
    description: "Pilih keterampilan yang ingin dilatih dan seri simulasi ujian.",
    area: "Bidang ujian",
    round: "Seri simulasi ujian",
    emptyRounds: "Belum ada simulasi ujian",
    action: "Simulasi ujian segera hadir",
    notice: "Simulasi ujian sedang disiapkan. Latihan soal, penilaian, dan riwayat ujian belum tersedia.",
  },
};
