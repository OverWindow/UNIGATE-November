"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import type { Mode } from "@/lib/pbt-api";
import { pbtContent } from "@/lib/pbt-content";

type Phase = "ready" | "waiting" | "loading" | "playing" | "ended" | "used" | "blocked" | "error";
export type AudioProgress = { playbackKey?: string; elapsed: number; duration: number | null };
// Keep the restriction during navigation even when session storage is unavailable.
const playedAudio = new Set<string>();

export default function ListeningPlayer({ url, mode, playbackKey, stopped = false, onPlayingChange, onProgressChange }: {
  url: string; mode?: Mode; playbackKey?: string; stopped?: boolean; onPlayingChange?: (playing: boolean) => void;
  onProgressChange?: (progress: AudioProgress) => void;
}) {
  const { language } = useApp();
  const t = pbtContent[language];
  const timed = mode === "timed";
  const storageKey = timed && playbackKey ? `topiq:pbt:audio:${playbackKey}` : null;
  const [phase, setPhase] = useState<Phase>(mode ? "waiting" : "ready");
  const audioRef = useRef<HTMLAudioElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const started = useRef(false);
  const locked = useRef(false);
  const playbackTime = useRef(0);
  const resumeAt = useRef<number | null>(null);

  const reportProgress = useCallback((audio: HTMLAudioElement) => {
    const position = resumeAt.current ?? audio.currentTime;
    onProgressChange?.({
      playbackKey,
      elapsed: Number.isFinite(position) ? Math.max(0, Math.floor(position)) : 0,
      duration: Number.isFinite(audio.duration) ? Math.max(0, Math.floor(audio.duration)) : null,
    });
  }, [playbackKey, onProgressChange]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || !active.current || stopped || locked.current) return;
    const request = generation.current;
    setPhase("loading");
    try { await audio.play(); }
    catch (error) {
      if (request !== generation.current) return;
      setPhase(error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error");
      onPlayingChange?.(false);
    }
  }, [stopped, onPlayingChange]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    active.current = true;
    started.current = false;
    locked.current = false;
    playbackTime.current = 0;
    resumeAt.current = null;
    let used = storageKey !== null && playedAudio.has(storageKey);
    if (storageKey) {
      try { used ||= sessionStorage.getItem(storageKey) === "played"; } catch { /* In-memory tracking remains available. */ }
    }
    locked.current = used;
    setPhase(stopped ? "ended" : used ? "used" : mode ? "waiting" : "ready");
    if (mode && !stopped && !used) timer.current = setTimeout(() => void play(), 3000);
    return () => {
      active.current = false;
      generation.current += 1;
      if (timer.current) clearTimeout(timer.current);
      audio.pause();
      onPlayingChange?.(false);
    };
  }, [url, mode, storageKey, stopped, play, onPlayingChange]);

  useEffect(() => {
    if (audioRef.current) reportProgress(audioRef.current);
  }, [url, reportProgress]);

  function handlePlaying() {
    if (!active.current || stopped || locked.current) { audioRef.current?.pause(); return; }
    if (timer.current) clearTimeout(timer.current);
    started.current = true;
    if (storageKey) {
      playedAudio.add(storageKey);
      try { sessionStorage.setItem(storageKey, "played"); } catch { /* In-memory tracking remains available. */ }
    }
    setPhase("playing");
    onPlayingChange?.(timed);
  }

  function retry() {
    if (!audioRef.current || stopped || locked.current) return;
    generation.current += 1;
    resumeAt.current = playbackTime.current;
    audioRef.current.load();
    if (mode) void play();
    else setPhase("ready");
  }

  const status = phase === "waiting" ? t.audioCountdown : phase === "loading" ? t.audioLoading
    : phase === "playing" ? t.audioPlaying : phase === "ended" ? t.audioEnded : phase === "used" ? t.audioUsed : "";

  return <div className="pbt-audio">
    <p>{timed ? t.audioTimedHint : t.audioHint}</p>
    {mode && status && <p className="pbt-audio-status" role="status">{status}</p>}
    <audio ref={audioRef} controls={!timed} hidden={timed || phase === "waiting" || stopped}
      controlsList="nodownload" preload={mode ? "auto" : "none"} src={url} aria-label={t.listening}
      onPlaying={handlePlaying}
      onLoadedMetadata={event => {
        if (resumeAt.current !== null) {
          playbackTime.current = resumeAt.current;
          event.currentTarget.currentTime = resumeAt.current;
          resumeAt.current = null;
        }
        reportProgress(event.currentTarget);
      }}
      onDurationChange={event => reportProgress(event.currentTarget)}
      onTimeUpdate={event => {
        if (resumeAt.current === null && !event.currentTarget.seeking) playbackTime.current = event.currentTarget.currentTime;
        reportProgress(event.currentTarget);
      }}
      onSeeking={event => {
        if (timed && Math.abs(event.currentTarget.currentTime - playbackTime.current) > 0.35) event.currentTarget.currentTime = playbackTime.current;
      }}
      onSeeked={event => reportProgress(event.currentTarget)}
      onRateChange={event => { if (timed && event.currentTarget.playbackRate !== 1) event.currentTarget.playbackRate = 1; }}
      onPause={event => {
        if (!active.current || stopped || locked.current || event.currentTarget.ended || event.currentTarget.error) return;
        if (timed && started.current) void play();
        else setPhase("ready");
      }}
      onEnded={event => { locked.current = timed; setPhase("ended"); onPlayingChange?.(false); reportProgress(event.currentTarget); }}
      onError={() => {
        if (!active.current || stopped || locked.current) return;
        if (timer.current) clearTimeout(timer.current);
        generation.current += 1;
        setPhase("error"); onPlayingChange?.(false);
      }} />
    {!stopped && phase === "blocked" && <p role="alert">{t.audioBlocked} <button type="button" onClick={() => void play()}>{t.audioStart}</button></p>}
    {!stopped && phase === "error" && <p role="alert">{t.audioError} <button type="button" onClick={retry}>{t.retry}</button></p>}
  </div>;
}
