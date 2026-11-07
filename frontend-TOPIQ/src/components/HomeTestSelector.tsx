"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { useApp } from "@/app/providers";
import { homeContent } from "@/lib/home-content";
import { pbtRequest, type Attempt, type Exam, type Mode, type Section } from "@/lib/pbt-api";
import { pbtContent, pbtErrorMessage } from "@/lib/pbt-content";
import styles from "./LandingPage.module.css";

export default function HomeTestSelector() {
  const { language, user, status, refreshSession } = useApp();
  const t = homeContent[language].tests;
  const p = pbtContent[language];
  const router = useRouter();
  const [exams, setExams] = useState<Exam[]>([]);
  const [round, setRound] = useState<number | null>(null);
  const [section, setSection] = useState<Section>("reading");
  const [mode, setMode] = useState<Mode>("timed");
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);
  const startingRef = useRef(false);

  useEffect(() => {
    if (status === "loading" || status === "error") return;
    let active = true;
    setLoading(true);
    setError(null);
    setExams([]);
    void pbtRequest<{ exams: Exam[] }>("exams/")
      .then(catalog => { if (active) setExams(catalog.exams); })
      .catch(cause => { if (active) setError(cause); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [status, user?.id, revision]);

  const rounds = [...new Set(exams.map(exam => exam.round))].sort((a, b) => a - b);
  const selectedRound = round !== null && rounds.includes(round) ? round : rounds[0];
  const roundExams = exams.filter(exam => exam.round === selectedRound);
  const selectedExam = roundExams.find(exam => exam.section === section) ?? roundExams[0];
  const waiting = status === "loading" || (status !== "error" && loading);
  const unavailable = waiting || starting || status === "error" || !selectedExam;

  async function start(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (unavailable || !selectedExam || startingRef.current) return;
    if (!selectedExam.accessible) {
      router.push(`/login?next=${encodeURIComponent("/#tests")}`);
      return;
    }
    startingRef.current = true;
    setStarting(true);
    setError(null);
    try {
      // The existing endpoint resumes an active attempt instead of discarding answers.
      const attempt = await pbtRequest<Attempt>("attempts/", "POST", { examId: selectedExam.id, mode });
      router.push(`/pbt/attempts/${attempt.id}`);
    } catch (cause) {
      setError(cause);
      setStarting(false);
      startingRef.current = false;
    }
  }

  return <section id="tests" className={styles.tests} aria-labelledby="tests-title">
    <div className={styles.container}>
      <div className={styles.sectionIntro}><h2 id="tests-title" className={styles.heading}>{t.title}</h2><p className={styles.description}>{t.description}</p></div>
      <form className={styles.testForm} onSubmit={event => void start(event)} aria-busy={waiting || starting}>
        <label><span>{t.round}</span><select value={selectedRound ?? ""} disabled={unavailable} onChange={event => setRound(Number(event.target.value))}>
          {!rounds.length && <option value="">—</option>}
          {rounds.map(value => <option key={value} value={value}>{language === "ko" ? `${value}회` : `${t.round} ${value}`}</option>)}
        </select></label>
        <label><span>{t.section}</span><select value={selectedExam?.section ?? ""} disabled={unavailable} onChange={event => setSection(event.target.value as Section)}>
          {!roundExams.length && <option value="">—</option>}
          {(["reading", "listening"] as const).filter(value => roundExams.some(exam => exam.section === value)).map(value => <option key={value} value={value}>{p[value]}</option>)}
        </select></label>
        <label><span>{t.mode}</span><select value={mode} disabled={unavailable} onChange={event => setMode(event.target.value as Mode)}><option value="timed">{t.timed}</option><option value="practice">{t.practice}</option></select></label>
        <button type="submit" className={styles.startButton} disabled={unavailable}>
          {waiting || starting ? p.loading : selectedExam && !selectedExam.accessible ? p.login : t.start}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </form>
      {(error || status === "error") ? <p className={styles.testError} role="alert">{pbtErrorMessage(error, p)}<button type="button" onClick={() => { if (status === "error") void refreshSession(); else setRevision(value => value + 1); }}>{p.retry}</button></p>
        : !waiting && !exams.length ? <p className={styles.testStatus} role="status">{p.empty}</p> : null}
    </div>
  </section>;
}
