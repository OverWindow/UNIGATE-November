"use client";

import { useEffect, useRef } from "react";
import styles from "./AuthBackground.module.css";

export default function AuthBackground() {
  const backgroundRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const background = backgroundRef.current;
    const screen = background?.parentElement;
    if (!background || !screen) return;

    const interactive = window.matchMedia("(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");

    const leave = () => background.removeAttribute("data-active");

    const move = (event: PointerEvent) => {
      if (!interactive.matches || event.pointerType !== "mouse") return;
      const bounds = screen.getBoundingClientRect();
      background.style.setProperty("--glow-x", `${event.clientX - bounds.left}px`);
      background.style.setProperty("--glow-y", `${event.clientY - bounds.top}px`);
      background.dataset.active = "true";
    };

    screen.addEventListener("pointermove", move, { passive: true });
    screen.addEventListener("pointerleave", leave);
    interactive.addEventListener("change", leave);
    return () => {
      screen.removeEventListener("pointermove", move);
      screen.removeEventListener("pointerleave", leave);
      interactive.removeEventListener("change", leave);
    };
  }, []);

  return <div ref={backgroundRef} className={styles.background} aria-hidden="true" />;
}
