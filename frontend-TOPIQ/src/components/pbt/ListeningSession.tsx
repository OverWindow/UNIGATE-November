"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { useApp } from "@/app/providers";
import { clockText, type Mode } from "@/lib/pbt-api";
import type { ExamFormat } from "@/lib/exam-content";
import { pbtContent } from "@/lib/pbt-content";
import { listeningClock, listeningCopy, phaseSeconds, readListeningCheckpoint, saveListeningCheckpoint, solvingSeconds, type ListeningCheckpoint } from "@/lib/listening";

interface Props {
  examFormat: ExamFormat;
  attemptId: string;
  position: number;
  lastPosition: number;
  total: number;
  questionCount: number;
  url: string;
  mode: Mode;
  stopped: boolean;
  volume: number;
  onVolumeChange: (volume: number) => void;
  paperRef: RefObject<HTMLElement | null>;
  onComplete: (position: number) => void;
  children: ReactNode;
}

export default function ListeningSession({ examFormat, attemptId, position, lastPosition, total, questionCount, url, mode, stopped, volume, onVolumeChange, paperRef, onComplete, children }: Props) {
  const { language } = useApp();
  const t = listeningCopy[language];
  const common = pbtContent[language];
  const timed = mode === "timed";
  const solveTime = solvingSeconds(questionCount);
  const [checkpoint, setCheckpoint] = useState<ListeningCheckpoint>(() => {
    const saved = timed ? readListeningCheckpoint(attemptId, examFormat) : null;
    return saved?.position === position ? saved : {
      position, phase: "waiting", deadline: Date.now() + 3000, elapsed: 0, duration: null, volume: saved?.volume ?? volume,
    };
  });
  const current = useRef(checkpoint);
  const audioRef = useRef<HTMLAudioElement>(null);
  const active = useRef(false);
  const generation = useRef(0);
  const playPending = useRef(false);
  const [now, setNow] = useState(Date.now);
  const [playing, setPlaying] = useState(false);
  const [audioStatus, setAudioStatus] = useState<"ready" | "loading" | "blocked" | "error">("ready");

  const update = useCallback((changes: Partial<ListeningCheckpoint>) => {
    const next = { ...current.current, ...changes };
    current.current = next;
    if (timed) saveListeningCheckpoint(attemptId, next, examFormat);
    setCheckpoint(next);
  }, [attemptId, timed, examFormat]);

  const play = useCallback(async () => {
    const audio = audioRef.current;
    if (!active.current || stopped || !audio || playPending.current) return;
    if (timed && ["solving", "complete"].includes(current.current.phase)) return;
    playPending.current = true;
    const playingGeneration = generation.current;
    update({ phase: "listening", deadline: null });
    setAudioStatus("loading");
    try { await audio.play(); }
    catch (error) {
      if (active.current && playingGeneration === generation.current && !stopped) setAudioStatus(error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error");
    } finally { if (playingGeneration === generation.current) playPending.current = false; }
  }, [stopped, timed, update]);

  useEffect(() => {
    active.current = true;
    generation.current += 1;
    const audio = audioRef.current;
    if (audio) audio.volume = current.current.volume;
    if (timed) saveListeningCheckpoint(attemptId, current.current, examFormat);
    if (stopped) audio?.pause();
    else if (current.current.phase === "listening") void play();
    return () => { active.current = false; generation.current += 1; playPending.current = false; audio?.pause(); };
  }, [attemptId, timed, stopped, play, examFormat]);

  useEffect(() => {
    if (stopped) return;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      const state = current.current;
      if (phaseSeconds(state.deadline, time) !== 0) return;
      if (state.phase === "waiting") void play();
      else if (timed && state.phase === "solving") update({ phase: "complete", deadline: null });
    };
    tick();
    const timer = window.setInterval(tick, 100);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [stopped, timed, play, update]);

  useEffect(() => {
    if (timed && checkpoint.phase === "complete") onComplete(position);
  }, [checkpoint.phase, timed, position, onComplete]);

  const phase = checkpoint.phase;
  const waitSeconds = phase === "waiting" ? phaseSeconds(checkpoint.deadline, now) ?? 0 : 0;
  const audioRemaining = checkpoint.duration === null ? null : Math.max(0, checkpoint.duration - checkpoint.elapsed);
  const answerSeconds = phase === "complete" ? 0 : phase === "solving" ? phaseSeconds(checkpoint.deadline, now) ?? 0 : solveTime;
  const progressTime = `${clockText(Math.floor(checkpoint.elapsed))} / ${checkpoint.duration === null ? "--:--" : clockText(Math.ceil(checkpoint.duration))}`;

  return <>
    <section ref={paperRef} className="pbt-exam-width pbt-test-paper ibt-listening-paper" tabIndex={-1} aria-labelledby="pbt-section-title">
      <div className="pbt-paper-heading ibt-listening-heading">
        <h2 id="pbt-section-title">[{common.listening}]</h2>
        <div className="ibt-phase-timers">
          {([
            ["waiting", listeningClock(waitSeconds)],
            ["listening", audioRemaining === null ? "--:--:--" : listeningClock(audioRemaining)],
            ["solving", timed ? listeningClock(answerSeconds) : "∞"],
          ] as const).map(([name, time]) => <div key={name} className={`ibt-phase-timer${phase === name ? " is-active" : ""}`} role="timer" aria-label={`${t[name]} ${time}`} aria-current={phase === name ? "step" : undefined}>
            <span>{t[name]}</span><strong>{time}</strong>
          </div>)}
        </div>
        <span className="pbt-position">{position}{lastPosition !== position ? `–${lastPosition}` : ""} / {total}</span>
      </div>
      {(audioStatus === "blocked" || audioStatus === "error") && <div className="pbt-alert ibt-audio-alert" role="alert">
        {audioStatus === "blocked" ? common.audioBlocked : common.audioError}
        <button type="button" disabled={stopped} onClick={() => {
          if (audioRef.current?.error) audioRef.current.load();
          void play();
        }}>{audioStatus === "blocked" ? common.audioStart : common.retry}</button>
      </div>}
      {audioStatus === "loading" && <p className="pbt-muted" role="status">{common.audioLoading}</p>}
      <div className="ibt-listening-questions">{children}</div>
    </section>
    <div className="ibt-audio-bar">
      <div className="ibt-audio-controls pbt-exam-width">
        <div className="ibt-audio-progress">
          {!timed && <button type="button" className="ibt-play-button" aria-label={playing ? t.pause : t.play} disabled={stopped} onClick={() => {
            if (playing) audioRef.current?.pause(); else void play();
          }}>{playing ? <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3 2h4v12H3zm6 0h4v12H9z" /></svg> : <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 1v14l11-7z" /></svg>}</button>}
          <span className="ibt-progress-time">{progressTime}</span>
          {timed ? <progress aria-label={t.progress} max={checkpoint.duration || 1} value={checkpoint.elapsed} />
            : <input type="range" aria-label={t.progress} min="0" max={checkpoint.duration || 1} step="0.1" value={checkpoint.elapsed} disabled={stopped || !checkpoint.duration} onChange={event => {
              const elapsed = Number(event.target.value);
              if (audioRef.current) audioRef.current.currentTime = elapsed;
              update({ elapsed });
            }} />}
        </div>
        <label className="ibt-volume">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m11 4-6 5H2v6h3l6 5z" fill="currentColor" /><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14" /></svg>
          <input type="range" aria-label={t.volume} min="0" max="1" step="0.01" value={checkpoint.volume} onChange={event => {
            const volume = Number(event.target.value);
            if (audioRef.current) audioRef.current.volume = volume;
            update({ volume });
            onVolumeChange(volume);
          }} />
        </label>
      </div>
    </div>
    <audio ref={audioRef} src={url} preload="auto" hidden
      onLoadedMetadata={event => {
        const audio = event.currentTarget;
        if (!Number.isFinite(audio.duration)) return;
        const elapsed = Math.min(current.current.elapsed, audio.duration);
        update({ duration: audio.duration, elapsed });
        if (elapsed > 0) audio.currentTime = elapsed;
      }}
      onPlaying={() => { setPlaying(true); setAudioStatus("ready"); }}
      onWaiting={() => { if (current.current.phase === "listening") setAudioStatus("loading"); }}
      onTimeUpdate={event => {
        if (!active.current || event.currentTarget.seeking || (timed && current.current.phase !== "listening")) return;
        update({ elapsed: event.currentTarget.currentTime });
      }}
      onSeeking={event => {
        if (timed && Math.abs(event.currentTarget.currentTime - current.current.elapsed) > .35) event.currentTarget.currentTime = current.current.elapsed;
      }}
      onRateChange={event => { if (timed && event.currentTarget.playbackRate !== 1) event.currentTarget.playbackRate = 1; }}
      onPause={event => {
        setPlaying(false);
        if (timed && active.current && !stopped && !event.currentTarget.ended && !event.currentTarget.error && current.current.phase === "listening") void play();
      }}
      onEnded={event => {
        if (!active.current || stopped || (timed && current.current.phase !== "listening")) return;
        setPlaying(false); setAudioStatus("ready");
        update({ phase: "solving", elapsed: event.currentTarget.duration, deadline: timed ? Date.now() + solveTime * 1000 : null });
      }}
      onError={() => { setPlaying(false); setAudioStatus("error"); }}
    />
  </>;
}
