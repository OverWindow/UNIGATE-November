import type { Garu, Token } from "garu-ko/browser";

const ASSETS = "/garu-0.13.0";
const VERSION = "4:garu-0.13.0:segments=1";
const PARTS: Record<string, number> = {
  NNG: 1, NNP: 1, NNB: 11, NP: 2, NR: 3, VV: 5, VA: 6, MM: 7, MAG: 8, MAJ: 8, VX: 12,
};
const SUFFIXES: Record<string, Token["pos"]> = { XSV: "VV", XSA: "VA", XSM: "MAG" };
let runtime: Promise<typeof import("garu-ko/browser")> | undefined;

function loadRuntime() {
  runtime ??= (async () => {
    const moduleUrl = `${ASSETS}/dist/browser.js`;
    const wasmUrl = `${ASSETS}/pkg/garu_wasm.js`;
    const [module, wasm] = await Promise.all([
      import(/* webpackIgnore: true */ /* turbopackIgnore: true */ moduleUrl) as Promise<typeof import("garu-ko/browser")>,
      import(/* webpackIgnore: true */ /* turbopackIgnore: true */ wasmUrl),
    ]);
    const response = await fetch(`${ASSETS}/pkg/garu_wasm_bg.wasm`, { signal: AbortSignal.timeout(60_000), cache: "force-cache" });
    if (!response.ok) throw new Error("analysis_unavailable");
    // Upstream shares a WASM instance; serialize initialization across rapid study-page changes.
    await wasm.default({ module_or_path: response });
    return module;
  })().catch(error => { runtime = undefined; throw error; });
  return runtime;
}
export type ExampleCandidate = [headword: string, partOfSpeech: number];
export interface ExampleSegment {
  text: string; start: number; end: number; candidates: ExampleCandidate[];
}
export interface ExampleAnalysis { version: string; segments: ExampleSegment[] }

export function segmentExample(text: string, tokens: Token[]): ExampleSegment[] {
  const joined: Token[] = [];
  for (const token of tokens) {
    const previous = joined.at(-1);
    const suffix = SUFFIXES[token.pos];
    if (suffix && previous && ["NNG", "NNP", "XR"].includes(previous.pos)
        && previous.start === token.start && previous.end === token.end) {
      previous.text += token.text;
      previous.pos = suffix;
    } else joined.push({ ...token });
  }

  const segments: ExampleSegment[] = [];
  let start = 0;
  for (const match of text.matchAll(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_]+/gu)) {
    // Garu and the API count code points. Garu spans cover the whole eojeol, including punctuation.
    const end = start + Array.from(match[0]).length;
    const candidates: ExampleCandidate[] = [];
    if (/^[\p{L}\p{N}_]/u.test(match[0])) {
      for (const token of joined) {
        const part = PARTS[token.pos];
        const lemma = token.text + (["VV", "VA", "VX"].includes(token.pos) ? "다" : "");
        if (part && token.start < end && token.end > start && /[가-힣]/.test(lemma)
            && Array.from(lemma).length <= 100 && !candidates.some(([word, pos]) => word === lemma && pos === part)) {
          candidates.push([lemma, part]);
        }
      }
    }
    segments.push({ text: match[0], start, end, candidates: candidates.slice(0, 3) });
    start = end;
  }
  return segments;
}

export async function exampleVersion(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${VERSION}\0${text}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createExampleAnalyzer() {
  const lifetime = new AbortController();
  let pending: Promise<Garu> | undefined;
  let instance: Garu | undefined;

  async function initialize() {
    lifetime.signal.throwIfAborted();
    // Remove the retired analyzer's large model cache on upgraded clients.
    void window.caches?.delete("topiq-kiwi-0.24.1-model-0.24.0").catch(() => undefined);
    const signal = AbortSignal.any([lifetime.signal, AbortSignal.timeout(60_000)]);
    const [{ Garu }, modelData] = await Promise.all([
      loadRuntime(),
      fetch(`${ASSETS}/models/base.gmdl`, { signal, cache: "force-cache" }).then(response => {
        if (!response.ok) throw new Error("analysis_unavailable");
        return response.arrayBuffer();
      }),
    ]);
    signal.throwIfAborted();
    const analyzer = await Garu.load({ modelData });
    if (signal.aborted) {
      analyzer.destroy();
      signal.throwIfAborted();
    }
    instance = analyzer;
    return analyzer;
  }

  return {
    async analyze(text: string, signal: AbortSignal): Promise<ExampleAnalysis> {
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      if (Array.from(text).length > 2000) throw new Error("example_unavailable");
      const version = await exampleVersion(text);
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      if (!/[가-힣]/.test(text)) return { version, segments: segmentExample(text, []) };
      pending ??= initialize().catch(error => { pending = undefined; throw error; });
      const analyzer = await pending;
      signal.throwIfAborted();
      lifetime.signal.throwIfAborted();
      const result = analyzer.analyze(text);
      return { version, segments: segmentExample(text, Array.isArray(result) ? result[0]?.tokens ?? [] : result.tokens) };
    },
    dispose() {
      lifetime.abort();
      instance?.destroy();
      instance = undefined;
      pending = undefined;
    },
  };
}
export type ExampleAnalyzer = ReturnType<typeof createExampleAnalyzer>;
