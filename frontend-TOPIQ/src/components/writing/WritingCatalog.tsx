"use client";

import Link from "next/link";
import useRouter from "@/lib/use-navigation-router";
import { ArrowRight, Check, Lock, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useApp } from "@/app/providers";
import { writingRequest, unlockWriting, WritingError, type WritingSet } from "@/lib/writing/writing-api";
import { writingContent } from "@/lib/writing/writing-content";
import { closeWithMotion } from "@/lib/modal-motion";
import { localizedPath } from "@/lib/locale-path";

export default function WritingCatalog() {
  const { language, user, refreshSession, refreshCredits } = useApp();
  const router = useRouter();
  const t = writingContent[language];
  const c = t.catalog;
  const [sets, setSets] = useState<WritingSet[] | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [lockedSet, setLockedSet] = useState<WritingSet | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState("");
  const unlockOperation = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const dialogTitle = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setSets(null); setError(false);
    void writingRequest<{ sets: WritingSet[] }>("sets/", controller.signal).then(result => {
      if (!controller.signal.aborted) setSets(result.sets);
    }).catch(cause => { if (!controller.signal.aborted) {
      setError(true);
      if (cause instanceof WritingError && cause.status === 401) void refreshSession();
    } });
    return () => controller.abort();
  }, [revision, refreshSession, user?.id]);

  useEffect(() => () => unlockOperation.current?.abort(), []);

  function closeDialog() {
    const element = dialog.current;
    if (unlockOperation.current || !element?.open || element.dataset.closing) return;
    closeWithMotion(element, () => {
      element.close();
      setLockedSet(null);
      setUnlockError("");
    });
  }

  async function openSet() {
    if (!lockedSet || !user || unlockOperation.current) return;
    const controller = new AbortController();
    unlockOperation.current = controller;
    setUnlocking(true); setUnlockError("");
    try {
      await unlockWriting(lockedSet.id, controller.signal);
      if (controller.signal.aborted) return;
      setSets(previous => previous?.map(set => set.id === lockedSet.id ? { ...set, unlocked: true } : set) ?? null);
      await refreshCredits(controller.signal).catch(() => {});
      if (!controller.signal.aborted) {
        const element = dialog.current;
        await new Promise<void>(resolve => {
          closeWithMotion(element, () => { element?.close(); resolve(); });
        });
        if (controller.signal.aborted) return;
        setLockedSet(null);
        router.push(localizedPath(`/writing/sets/${lockedSet.id}`, language));
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setUnlockError(cause instanceof WritingError ? cause.code : "unknown");
        if (cause instanceof WritingError && cause.status === 401) void refreshSession();
      }
    } finally {
      if (unlockOperation.current === controller) unlockOperation.current = null;
      if (!controller.signal.aborted) setUnlocking(false);
    }
  }

  useEffect(() => {
    const element = dialog.current;
    if (!lockedSet || !element) return;
    const returnFocus = trigger.current;
    const previousOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    element.showModal();
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    dialogTitle.current?.focus({ preventScroll: true });
    return () => {
      element.close();
      document.documentElement.style.overflow = previousOverflow;
      document.body.style.overflow = previousBodyOverflow;
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, [lockedSet]);

  return <>
    <section className="catalog-hero" aria-labelledby="writing-title"><div className="page-container writing-hero-heading">
      <div className="writing-hero-copy">
        <h1 id="writing-title" className="catalog-title">{t.title}</h1>
        <p className="catalog-description">{t.intro}</p>
      </div>
      <Link className="writing-history-link" href="/writing/history">{c.history}<ArrowRight size={16} aria-hidden="true" /></Link>
    </div></section>
    <div className="page-container writing-catalog">
      <section id="writing-sets" tabIndex={-1} aria-label={t.back}>
        {error ? <div className="catalog-status" role="alert"><p>{t.error}</p>
          <button className="button writing-secondary" onClick={() => setRevision(value => value + 1)}>{t.retry}</button>
        </div> : sets === null ? <p className="catalog-status" role="status">{t.loading}</p>
          : sets.length === 0 ? <p className="catalog-status">{t.empty}</p>
            : <div className="writing-set-grid">{sets.map(set => {
              const submitted = set.submittedSlots ?? [];
              const content = <>
                <span className="catalog-set-number" aria-hidden="true">{String(set.number).padStart(2, "0")}</span>
                <h2>{t.set} {set.number}</h2>
                <ul className="writing-set-outline" aria-label={t.submissionHistory}>
                  {[51, 52, 53, 54].map(slot => <li key={slot}
                    className={submitted.includes(slot) ? "is-submitted" : undefined}
                    aria-label={`${slot} · ${t.types[slot]} · ${submitted.includes(slot) ? t.submitted : t.notSubmitted}`}>
                    <span className="writing-outline-number">{slot}</span><span>{t.types[slot]}</span>
                    <span className="writing-outline-status" title={submitted.includes(slot) ? t.submitted : t.notSubmitted} aria-hidden="true">
                      {submitted.includes(slot) && <Check size={13} />}
                    </span>
                  </li>)}
                </ul>
                <span className="writing-set-action">{(!user || !set.unlocked) && <Lock size={16} aria-hidden="true" />}
                  {!user ? t.loginToOpen : set.unlocked ? t.reopen : t.unlock.replace("{credits}", String(set.setCost))}<ArrowRight size={17} aria-hidden="true" /></span>
              </>;
              return user && set.unlocked
                ? <Link className="writing-set-card catalog-card" href={localizedPath(`/writing/sets/${set.id}`, language)} key={set.id}>{content}</Link>
                : <button className="writing-set-card catalog-card" type="button" aria-haspopup="dialog" key={set.id}
                  onClick={event => { trigger.current = event.currentTarget; setUnlockError(""); setLockedSet(set); }}>{content}</button>;
            })}</div>}
      </section>
    </div>
    <dialog ref={dialog} className="writing-login-dialog" aria-labelledby="writing-login-title" aria-describedby="writing-login-description"
      onCancel={event => { event.preventDefault(); closeDialog(); }}
      onClick={event => { if (event.target === event.currentTarget) closeDialog(); }}>
      {lockedSet && <div className="writing-login-panel">
        <button className="writing-login-close" type="button" aria-label={t.close} disabled={unlocking} onClick={closeDialog}><X size={20} aria-hidden="true" /></button>
        <Lock className="writing-login-icon" size={28} aria-hidden="true" />
        <h2 ref={dialogTitle} id="writing-login-title" tabIndex={-1}>{user ? `${t.set} ${lockedSet.number}` : t.lockedTitle}</h2>
        <p id="writing-login-description">{user ? t.unlockNote : t.loginRequired}</p>
        {user ? <>
          <button className="button button-primary" type="button" disabled={unlocking} aria-busy={unlocking} onClick={() => void openSet()}>
            {unlocking ? t.unlocking : t.unlock.replace("{credits}", String(lockedSet.setCost))}
          </button>
          {unlockError && <p className="writing-unlock-error" role="alert">{unlockError === "insufficient_credits" ? t.insufficientCredits
            : unlockError === "not_found" ? t.notFound : unlockError === "question_unavailable" ? t.error : t.unlockError}</p>}
        </> : <Link className="button button-primary" href={`/login?next=${encodeURIComponent(`/writing/sets/${lockedSet.id}`)}`}>{t.loginToOpen}</Link>}
      </div>}
    </dialog>
  </>;
}
