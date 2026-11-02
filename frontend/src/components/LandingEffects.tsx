"use client";

import { useEffect } from "react";
import { closeModal, isBackdropClick, openModal } from "@/lib/landing/modal";
import { trackEvent } from "@/lib/analytics";
import universities from "@/lib/landing/universities.json";

export default function LandingEffects() {
  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    const passive = { passive: true, signal };
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const modal = document.querySelector<HTMLDialogElement>("#stats-dialog")!;
    document.querySelectorAll("[data-open-stats]").forEach(button => {
      button.addEventListener("click", () => { trackEvent("university_stats_open"); openModal(modal); }, { signal });
    });
    modal.querySelector(".close")!.addEventListener("click", () => { void closeModal(modal); }, { signal });
    modal.addEventListener("cancel", event => { event.preventDefault(); void closeModal(modal); }, { signal });
    modal.addEventListener("click", event => { if (isBackdropClick(event, modal)) void closeModal(modal); }, { signal });

    const canvas = document.querySelector<HTMLCanvasElement>("#ambient-dots")!;
    const ctx = canvas.getContext("2d");
    const tilt = document.querySelector<HTMLElement>(".character-tilt")!;
    const face = document.querySelector<SVGElement>(".face")!;
    let w = 0, h = 0, raf = 0, last = 0;
    let dots: { x: number; y: number; r: number; vx: number; vy: number }[] = [];
    let mouse = { x: -1000, y: -1000 }, target = { x: 0, y: 0 };
    const look = { x: 0, y: 0 };

    function draw(time: number) {
      if (!ctx) return;
      const dt = last ? Math.min((time - last) / 16.67, 2) : 1;
      last = time;
      ctx.clearRect(0, 0, w, h);
      for (const dot of dots) {
        if (!reduceMotion.matches) {
          dot.x = (dot.x + dot.vx * dt + w) % w;
          dot.y = (dot.y + dot.vy * dt + h) % h;
        }
        const dx = dot.x - mouse.x, dy = dot.y - mouse.y, distance = Math.hypot(dx, dy);
        const near = Math.max(0, 1 - distance / 170), push = near * 12;
        ctx.beginPath();
        ctx.arc(dot.x + (distance ? dx / distance * push : 0), dot.y + (distance ? dy / distance * push : 0), dot.r + near * 1.4, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(71,58,107,${.13 + near * .25})`;
        ctx.fill();
        if (near > 0) {
          ctx.beginPath(); ctx.moveTo(dot.x, dot.y); ctx.lineTo(mouse.x, mouse.y);
          ctx.strokeStyle = `rgba(255,255,255,${near * .23})`; ctx.lineWidth = .6; ctx.stroke();
        }
      }
      if (!reduceMotion.matches) {
        look.x += (target.x - look.x) * .055;
        look.y += (target.y - look.y) * .055;
        tilt.style.setProperty("--ry", look.x * 13 + "deg");
        tilt.style.setProperty("--rx", -look.y * 10 + "deg");
        face.style.setProperty("--eye-x", look.x * 12 + "px");
        face.style.setProperty("--eye-y", look.y * 8 + "px");
        raf = requestAnimationFrame(draw);
      }
    }
    function resize() {
      w = innerWidth; h = innerHeight;
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      dots = Array.from({ length: Math.min(75, Math.floor(w * h / 14000)) }, () => ({
        x: Math.random() * w, y: Math.random() * h, r: Math.random() * .8 + .7,
        vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15,
      }));
      if (reduceMotion.matches) draw(0);
    }
    function restart() {
      cancelAnimationFrame(raf); last = 0; resize();
      if (!reduceMotion.matches && !document.hidden) raf = requestAnimationFrame(draw);
    }
    window.addEventListener("pointermove", event => {
      mouse.x = event.clientX; mouse.y = event.clientY;
      target.x = (event.clientX / w - .5) * 2; target.y = (event.clientY / h - .5) * 2;
    }, passive);
    document.addEventListener("pointerleave", () => { mouse = { x: -1000, y: -1000 }; target = { x: 0, y: 0 }; }, { signal });
    window.addEventListener("resize", resize, passive);
    document.addEventListener("visibilitychange", restart, { signal });
    reduceMotion.addEventListener("change", restart, { signal });
    restart();

    const section = document.querySelector<HTMLElement>("#universities")!;
    const gallery = section.querySelector<HTMLElement>(".university-window")!;
    const track = section.querySelector<HTMLElement>(".university-track")!;
    const progress = section.querySelector<HTMLElement>(".university-counter span")!;
    const counter = section.querySelector<HTMLElement>(".university-counter")!;
    let travel = 0, universityFrame = 0;
    function updateUniversities() {
      universityFrame = 0;
      const distance = Math.max(0, Math.min(travel, -section.getBoundingClientRect().top));
      track.style.transform = `translate3d(${-distance}px,0,0)`;
      const current = Math.min(universities.length, Math.round((travel ? distance / travel : 0) * (universities.length - 1)) + 1);
      progress.textContent = String(current).padStart(2, "0");
      counter.setAttribute("aria-label", `Kartu ${current} dari ${universities.length}`);
    }
    function sizeUniversities() {
      travel = Math.max(0, track.scrollWidth - gallery.clientWidth);
      const pinHeight = Math.max(innerHeight, section.querySelector<HTMLElement>(".university-pin")!.offsetHeight);
      section.style.height = pinHeight + travel + "px";
      updateUniversities();
    }
    window.addEventListener("scroll", () => { if (!universityFrame) universityFrame = requestAnimationFrame(updateUniversities); }, passive);
    window.addEventListener("resize", sizeUniversities, passive);
    gallery.addEventListener("keydown", event => {
      if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
      event.preventDefault();
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const start = scrollY + section.getBoundingClientRect().top;
      scrollTo({ top: Math.max(start, Math.min(start + travel, scrollY + direction * 320)), behavior: reduceMotion.matches ? "instant" : "smooth" });
    }, { signal });
    sizeUniversities();
    // Font loading can change the pinned gallery's height after the first layout.
    void document.fonts.ready.then(() => { if (!signal.aborted) sizeUniversities(); });

    const clockValues = [...document.querySelectorAll<HTMLElement>(".countdown-value")];
    if (clockValues.length) {
      const DAY = 24 * 3600;
      let remaining = DAY - 1;
      const timer = setInterval(() => {
        if (signal.aborted) { clearInterval(timer); return; }
        remaining = remaining > 0 ? remaining - 1 : DAY - 1;
        const parts = { hours: Math.floor(remaining / 3600), minutes: Math.floor((remaining % 3600) / 60), seconds: remaining % 60 };
        clockValues.forEach(element => {
          const unit = element.dataset.unit as keyof typeof parts;
          const next = String(parts[unit]).padStart(2, "0");
          if (element.textContent !== next) {
            element.textContent = next;
            if (!reduceMotion.matches) {
              element.classList.remove("is-flipping");
              void element.offsetWidth;
              element.classList.add("is-flipping");
            }
          }
        });
      }, 1000);
    }

    const reveals = [...document.querySelectorAll<HTMLElement>(".hero>div:first-child,.story-heading,.transfer-reasons article,.cost-story,.contents>div,.topics li,.university-heading,.university-window,.university-more,.cta,.site-footer")];    reveals.forEach(element => {
      element.classList.add("scroll-reveal");
      if (element.matches(".university-window")) element.classList.add("reveal-calm");
      if (element.matches(".topics li")) element.style.setProperty("--reveal-delay", Array.from(element.parentElement!.children).indexOf(element) * 65 + "ms");
    });
    let observer: IntersectionObserver | undefined;
    function setupReveals() {
      observer?.disconnect();
      if (reduceMotion.matches || !("IntersectionObserver" in window)) {
        reveals.forEach(element => element.classList.add("is-visible")); return;
      }
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => entry.target.classList.toggle("is-visible", entry.isIntersecting));
      }, { threshold: .12, rootMargin: "0px 0px -25px 0px" });
      reveals.forEach(element => observer!.observe(element));
    }
    setupReveals();
    reduceMotion.addEventListener("change", setupReveals, { signal });

    return () => {
      controller.abort(); observer?.disconnect();
      cancelAnimationFrame(raf); cancelAnimationFrame(universityFrame);
      modal.getAnimations().forEach(animation => animation.cancel());
    };
  }, []);
  return null;
}
