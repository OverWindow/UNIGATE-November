"use client";

import { LoaderCircle, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { vocabularyContent } from "@/lib/vocabulary-content";

export default function VocabularyAudio({ word, url }: { word: string; url: string | null }) {
  const { language } = useApp();
  const t = vocabularyContent[language];
  const audioRef = useRef<HTMLAudioElement>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const pending = useRef(false);
  const [phase, setPhase] = useState<"ready" | "loading" | "playing" | "error">("ready");

  useEffect(() => {
    active.current = true;
    const audio = audioRef.current;
    return () => {
      active.current = false;
      generation.current += 1;
      audio?.pause();
      audio?.removeAttribute("src");
      audio?.load();
    };
  }, []);

  async function play() {
    const audio = audioRef.current;
    if (!audio || !url || pending.current) return;
    const request = ++generation.current;
    pending.current = true;
    setPhase("loading");
    try {
      if (audio.error || !audio.getAttribute("src")) {
        audio.src = url;
        audio.load();
      }
      audio.currentTime = 0;
      await audio.play();
      if (active.current && request === generation.current) setPhase(audio.ended ? "ready" : "playing");
    } catch {
      if (active.current && request === generation.current) setPhase("error");
    } finally {
      if (request === generation.current) pending.current = false;
    }
  }

  const label = !url ? t.audioMissing : phase === "loading" ? t.audioLoading
    : phase === "playing" ? t.audioReplay : phase === "error" ? t.audioRetry : t.audioPlay;
  const status = !url ? t.audioMissing : phase === "loading" ? t.audioLoading
    : phase === "playing" ? t.audioPlaying : phase === "error" ? t.audioError : "";

  return <div className="vocabulary-pronunciation">
    <div className="vocabulary-word-heading">
      <h2 id="vocabulary-word" lang="ko">{word}</h2>
      <button type="button" className={`vocabulary-audio-button${phase === "playing" ? " is-playing" : ""}`}
        disabled={!url || phase === "loading"} aria-label={`${word}: ${label}`} title={label} onClick={() => void play()}>
        {phase === "loading" ? <LoaderCircle size={22} className="vocabulary-audio-spinner" aria-hidden="true" />
          : <Volume2 size={22} aria-hidden="true" />}
      </button>
    </div>
    <p className="vocabulary-audio-status" role="status">{status}</p>
    <audio ref={audioRef} preload="none" hidden
      onWaiting={() => { if (active.current) setPhase("loading"); }}
      onPlaying={() => { if (active.current) setPhase("playing"); }}
      onEnded={() => { if (active.current) setPhase("ready"); }}
      onError={() => {
        if (!active.current) return;
        generation.current += 1;
        pending.current = false;
        setPhase("error");
      }} />
  </div>;
}
