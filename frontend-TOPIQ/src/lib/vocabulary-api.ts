export type MeaningLanguage = "en" | "vi" | "ja" | "zh-Hans" | "id";
export interface VocabularyLevel { level: number; wordCount: number; setCount: number }
export interface VocabularySet {
  id: string; level: number; number: number; wordCount: number; preview: string[];
}
export interface VocabularyWord {
  id: string; position: number; korean: string; partOfSpeech: string;
  meanings: Record<MeaningLanguage, string>; exampleKorean: string; exampleEnglish: string;
  audioUrl: string | null;
}
export interface VocabularyDetail extends VocabularySet { catalogPage: number; words: VocabularyWord[] }
export interface VocabularyCatalogData {
  level: number; page: number; pageCount: number; totalSets: number; sets: VocabularySet[];
}

export class VocabularyError extends Error {
  constructor(public code: string, public status = 0) { super(code); }
}

export async function vocabularyRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  const abort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`/api/vocabulary/${path}`, {
      method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
    });
    let data;
    try { data = await response.json(); }
    catch (error) {
      if (controller.signal.aborted) throw error;
      throw new VocabularyError("server_error", response.status);
    }
    if (!response.ok) throw new VocabularyError(typeof data?.error === "string" ? data.error : "server_error", response.status);
    return data as T;
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof VocabularyError) throw error;
    throw new VocabularyError("network_error");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

export function catalogSelection(params: Pick<URLSearchParams, "get">) {
  const rawLevel = params.get("level") ?? "3";
  const rawPage = params.get("page") ?? "1";
  return {
    level: /^[3-6]$/.test(rawLevel) ? Number(rawLevel) : 3,
    page: /^[1-9]\d{0,6}$/.test(rawPage) && Number(rawPage) <= 1000000 ? Number(rawPage) : 1,
  };
}
