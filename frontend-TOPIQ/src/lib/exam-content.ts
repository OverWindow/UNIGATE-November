import type { Language } from "./landing-content";

export type ExamFormat = "pbt" | "ibt";

interface ExamContent {
  formats: Record<ExamFormat, { description: string }>;
}

export const examContent: Record<Language, ExamContent> = {
  ko: {
    formats: {
      pbt: {
        description: "TOPIK II PBT는 종이 문제지와 답안지를 사용하는 한국어능력시험입니다. 듣기·쓰기·읽기를 통해 중급·고급 한국어 능력을 평가하며, 쓰기 답안은 손으로 작성합니다.",
      },
      ibt: {
        description: "TOPIK II IBT는 시험장에서 컴퓨터로 문제를 확인하고 답안을 입력하는 한국어능력시험입니다. 듣기·읽기·쓰기를 통해 중급·고급 한국어 능력을 평가하며, 쓰기 답안은 키보드로 작성합니다.",
      },
    },
  },
  en: {
    formats: {
      pbt: {
        description: "TOPIK II PBT is a Korean proficiency test taken with paper question booklets and answer sheets. It assesses intermediate and advanced listening, writing, and reading skills, with writing answers completed by hand.",
      },
      ibt: {
        description: "TOPIK II IBT is a Korean proficiency test taken on a computer at a test center. It assesses intermediate and advanced listening, reading, and writing skills, with writing answers typed on a keyboard.",
      },
    },
  },
  id: {
    formats: {
      pbt: {
        description: "TOPIK II PBT adalah ujian kemampuan bahasa Korea yang menggunakan buku soal dan lembar jawaban kertas. Ujian ini menilai kemampuan menyimak, menulis, dan membaca tingkat menengah hingga lanjut, dengan jawaban menulis ditulis tangan.",
      },
      ibt: {
        description: "TOPIK II IBT adalah ujian kemampuan bahasa Korea yang dikerjakan melalui komputer di pusat ujian. Ujian ini menilai kemampuan menyimak, membaca, dan menulis tingkat menengah hingga lanjut, dengan jawaban menulis diketik menggunakan papan ketik.",
      },
    },
  },
};
