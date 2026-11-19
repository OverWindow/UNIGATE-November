"use client";

import { useEffect, useRef } from "react";
import styles from "./LandingPage.module.css";

export default function LandingCharacter() {
  const tilt = useRef<HTMLDivElement>(null);
  const face = useRef<SVGGElement>(null);

  useEffect(() => {
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) return;
    let frame = 0;
    const target = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };
    const move = (event: PointerEvent) => {
      target.x = (event.clientX / innerWidth - .5) * 2;
      target.y = (event.clientY / innerHeight - .5) * 2;
    };
    const leave = () => { target.x = 0; target.y = 0; };
    function draw() {
      look.x += (target.x - look.x) * .055;
      look.y += (target.y - look.y) * .055;
      tilt.current?.style.setProperty("--ry", `${look.x * 13}deg`);
      tilt.current?.style.setProperty("--rx", `${-look.y * 10}deg`);
      face.current?.style.setProperty("--eye-x", `${look.x * 12}px`);
      face.current?.style.setProperty("--eye-y", `${look.y * 8}px`);
      frame = requestAnimationFrame(draw);
    }
    window.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerleave", leave);
    frame = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener("pointermove", move);
      document.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <div className={styles.characterStage} role="img" aria-label="마우스 움직임에 반응하는 졸업 모자 캐릭터">
    <div className={`${styles.orbital} ${styles.orbitalOne}`} /><div className={`${styles.orbital} ${styles.orbitalTwo}`} />
    <div className={styles.orbitDot} /><div className={styles.characterShadow} />
    <div className={styles.characterFloat}><div className={styles.characterTilt} ref={tilt}><svg className={styles.character} viewBox="0 0 420 420" fill="none" aria-hidden="true">
      <defs>
        <radialGradient id="chrome" cx=".32" cy=".2" r=".83"><stop stopColor="#f4ffff"/><stop offset=".19" stopColor="#b9f4f1"/><stop offset=".36" stopColor="#90b7c4"/><stop offset=".51" stopColor="#434f6a"/><stop offset=".63" stopColor="#a8a9ee"/><stop offset=".76" stopColor="#5cdfd7"/><stop offset=".9" stopColor="#93f7b7"/><stop offset="1" stopColor="#247b9d"/></radialGradient>
        <radialGradient id="glow" cx=".55" cy=".95" r=".65"><stop stopColor="#47ffb4"/><stop offset=".5" stopColor="#20daa7" stopOpacity=".75"/><stop offset="1" stopColor="#1b8bd6" stopOpacity="0"/></radialGradient>
        <radialGradient id="shine" cx=".4" cy=".12" r=".65"><stop stopColor="#fff" stopOpacity=".95"/><stop offset=".42" stopColor="#d8ffff" stopOpacity=".7"/><stop offset=".75" stopColor="#b5ffff" stopOpacity="0"/></radialGradient>
        <linearGradient id="rim" x1="70" y1="70" x2="340" y2="350" gradientUnits="userSpaceOnUse"><stop stopColor="#f2ffff"/><stop offset=".38" stopColor="#97edf1"/><stop offset=".62" stopColor="#4739a1"/><stop offset="1" stopColor="#d2ffed"/></linearGradient>
        <linearGradient id="cap-top" x1="92" y1="25" x2="330" y2="105" gradientUnits="userSpaceOnUse"><stop stopColor="#9edbdd"/><stop offset=".22" stopColor="#39465e"/><stop offset=".5" stopColor="#25243f"/><stop offset=".76" stopColor="#3a5370"/><stop offset="1" stopColor="#111a28"/></linearGradient>
        <linearGradient id="cap-crown" x1="151" y1="76" x2="272" y2="130" gradientUnits="userSpaceOnUse"><stop stopColor="#86c9ce"/><stop offset=".25" stopColor="#33445f"/><stop offset=".62" stopColor="#24223c"/><stop offset="1" stopColor="#122a35"/></linearGradient>
        <linearGradient id="cap-tassel" x1="318" y1="79" x2="342" y2="151" gradientUnits="userSpaceOnUse"><stop stopColor="#9ce6df"/><stop offset=".42" stopColor="#526285"/><stop offset="1" stopColor="#26364a"/></linearGradient>
        <linearGradient id="cap-glint" x1="89" y1="43" x2="267" y2="93" gradientUnits="userSpaceOnUse"><stop stopColor="#efffff" stopOpacity=".75"/><stop offset=".48" stopColor="#b6f1f0" stopOpacity=".22"/><stop offset="1" stopColor="#d9caff" stopOpacity="0"/></linearGradient>
        <filter id="blur"><feGaussianBlur stdDeviation="12"/></filter><clipPath id="sphere"><circle cx="210" cy="210" r="164"/></clipPath>
      </defs>
      <circle cx="210" cy="210" r="166" fill="url(#rim)"/><g clipPath="url(#sphere)"><circle cx="210" cy="210" r="164" fill="url(#chrome)"/>
      <path d="M26 190C104 133 148 263 247 224S351 90 408 179V333H26Z" fill="#a3a6ff" opacity=".6" filter="url(#blur)"/>
      <path d="M37 270C107 215 186 306 261 248S354 204 396 273V405H37Z" fill="url(#glow)"/>
      <ellipse cx="187" cy="105" rx="130" ry="63" fill="url(#shine)" filter="url(#blur)"/>
      <ellipse cx="98" cy="219" rx="20" ry="97" fill="#e9ffff" opacity=".39" filter="url(#blur)"/>
      <path d="M77 161C94 96 151 65 200 65" stroke="#edffff" strokeOpacity=".75" strokeWidth="3" strokeLinecap="round"/>
      <g className={styles.face} ref={face}><g className={styles.eyes}><rect x="139" y="176" width="27" height="76" rx="13.5" fill="#161825"/><rect x="252" y="176" width="27" height="76" rx="13.5" fill="#161825"/><rect x="145" y="184" width="4" height="34" rx="2" fill="#fff" opacity=".11"/><rect x="258" y="184" width="4" height="34" rx="2" fill="#fff" opacity=".11"/></g></g>
      <path d="M163 350C211 367 263 355 294 335" stroke="#bbffe2" strokeWidth="2" strokeOpacity=".6" strokeLinecap="round"/></g>
      <g><path d="M143 72H277V108C277 133 143 133 143 108Z" fill="url(#cap-crown)"/>
      <path d="M143 106C163 124 257 124 277 106V113C277 138 143 138 143 113Z" fill="#151d31" opacity=".8"/>
      <path d="M151 115C185 128 238 129 269 116" stroke="#b4e9e8" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round"/>
      <path d="M210 9L361 63L210 117L59 63Z" fill="url(#cap-top)" stroke="#253849" strokeWidth="2" strokeLinejoin="round"/>
      <path d="M88 57L210 15L280 40C235 40 182 62 129 72Z" fill="url(#cap-glint)"/>
      <path d="M64 62L210 111L356 62" stroke="#b3eae9" strokeOpacity=".58" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M94 53L210 14L324 53" stroke="#e7ffff" strokeOpacity=".5" strokeWidth="2" strokeLinecap="round"/>
      <ellipse cx="210" cy="63" rx="8" ry="4" fill="#1a263c"/><ellipse cx="208" cy="62" rx="4" ry="1.5" fill="#c4f4f0" opacity=".7"/>
      <path d="M210 63C253 63 291 68 322 76C331 79 334 85 334 95V133" stroke="url(#cap-tassel)" strokeWidth="4" strokeLinecap="round"/>
      <rect x="329" y="126" width="10" height="10" rx="4" fill="#35465f"/>
      <path d="M327 134H341L344 153C340 158 328 158 324 153Z" fill="url(#cap-tassel)"/>
      <path d="M330 139L328 152M334 139V154M338 139L340 152" stroke="#b7eeeb" strokeOpacity=".5" strokeWidth="1.5" strokeLinecap="round"/></g>
    </svg></div></div>
  </div>;
}
