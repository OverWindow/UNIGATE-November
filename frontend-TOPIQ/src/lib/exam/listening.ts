import type { ExamFormat } from "./exam-content";

export type ListeningPhase = "waiting" | "listening" | "solving" | "complete";
export interface ListeningCheckpoint {
  position: number;
  phase: ListeningPhase;
  deadline: number | null;
  elapsed: number;
  duration: number | null;
  volume: number;
}

const checkpoints = new Map<string, ListeningCheckpoint>();
const key = (id: string, examFormat: ExamFormat) => `topiq:${examFormat}:listening:${id}`;

export function readListeningCheckpoint(id: string, examFormat: ExamFormat): ListeningCheckpoint | null {
  const storageKey = key(id, examFormat);
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw) {
      const value = JSON.parse(raw);
      if (Number.isInteger(value.position) && value.position >= 1 && value.position <= (examFormat === "pbt" ? 50 : 30)
        && ["waiting", "listening", "solving", "complete"].includes(value.phase)
        && (value.deadline === null || Number.isFinite(value.deadline))
        && (!(value.phase === "waiting" || value.phase === "solving") || value.deadline !== null)
        && Number.isFinite(value.elapsed) && value.elapsed >= 0
        && (value.duration === null || (Number.isFinite(value.duration) && value.duration >= 0))
        && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1) return value;
    }
  } catch { /* Keep timing in memory when session storage is unavailable. */ }
  return checkpoints.get(storageKey) ?? null;
}

export function saveListeningCheckpoint(id: string, value: ListeningCheckpoint, examFormat: ExamFormat) {
  const storageKey = key(id, examFormat);
  checkpoints.set(storageKey, value);
  try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* Storage may be disabled. */ }
}

export function solvingSeconds(questionCount: number) {
  return questionCount > 1 ? 20 : 13;
}

export function phaseSeconds(deadline: number | null, now: number) {
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
}

export function listeningClock(seconds: number) {
  const whole = Math.max(0, Math.ceil(seconds));
  return [Math.floor(whole / 3600), Math.floor(whole / 60) % 60, whole % 60].map(n => String(n).padStart(2, "0")).join(":");
}

export const listeningCopy = {
  ko: { waiting: "대기", listening: "듣기", solving: "풀이", estimatedDuration: { pbt: "약 60분", ibt: "약 35분" }, volume: "음량", progress: "음원 재생 위치", play: "재생", pause: "일시정지" },
  en: { waiting: "Wait", listening: "Listen", solving: "Answer", estimatedDuration: { pbt: "About 60 min", ibt: "About 35 min" }, volume: "Volume", progress: "Audio position", play: "Play", pause: "Pause" },
  id: { waiting: "Tunggu", listening: "Simak", solving: "Jawab", estimatedDuration: { pbt: "Sekitar 60 menit", ibt: "Sekitar 35 menit" }, volume: "Volume", progress: "Posisi audio", play: "Putar", pause: "Jeda" },
};
