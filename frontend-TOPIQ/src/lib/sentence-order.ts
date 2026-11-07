import type { Language } from "./landing-content";

export function moveSentence(order: (string | null)[], id: string, target: number | null) {
  const next = [...order];
  const source = next.indexOf(id);
  if (source !== -1) next[source] = target === null ? null : next[target];
  if (target !== null) next[target] = id;
  return next;
}

export const sentenceOrderCopy: Record<Language, {
  answer: string; bank: string; empty: string; hint: string; returnSentence: string;
  allPlaced: string; selected: string; partial: string;
}> = {
  ko: {
    answer: "답안 배열", bank: "제시문", empty: "문장을 끌어 놓으세요",
    hint: "문장을 끌어 놓거나, 문장을 선택한 뒤 답안 칸을 선택하세요. 채워진 칸으로 옮기면 문장이 교체됩니다.",
    returnSentence: "선택한 문장 되돌리기", allPlaced: "모든 문장을 배치했습니다. 문장을 이곳으로 끌어 되돌릴 수 있습니다.",
    selected: "선택한 문장", partial: "미응답 · 배열 미완성",
  },
  en: {
    answer: "Your order", bank: "Sentences", empty: "Drag a sentence here",
    hint: "Drag a sentence, or select it and then select an answer slot. Moving to a filled slot exchanges the sentences.",
    returnSentence: "Return selected sentence", allPlaced: "All sentences placed. Drag a sentence back here to return it.",
    selected: "Selected sentence", partial: "Unanswered · incomplete order",
  },
  id: {
    answer: "Urutan jawaban", bank: "Kalimat", empty: "Seret kalimat ke sini",
    hint: "Seret kalimat, atau pilih kalimat lalu pilih kotak jawaban. Memindahkan ke kotak terisi akan menukar kalimat.",
    returnSentence: "Kembalikan kalimat terpilih", allPlaced: "Semua kalimat telah ditempatkan. Seret kalimat kembali ke sini untuk mengembalikannya.",
    selected: "Kalimat terpilih", partial: "Belum dijawab · urutan belum lengkap",
  },
};
