"use client";

import { useEffect, useRef } from "react";
import styles from "./LandingPage.module.css";

export default function InteractiveDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    const context = canvas?.getContext("2d");
    if (!canvas || !parent || !context) return;
    const targetCanvas: HTMLCanvasElement = canvas;
    const container: HTMLElement = parent;
    const ctx: CanvasRenderingContext2D = context;
    const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0, height = 0, frame = 0, last = 0;
    let dots: { x: number; y: number; r: number; vx: number; vy: number }[] = [];
    const mouse = { x: -1000, y: -1000 };

    function draw(time: number) {
      const delta = last ? Math.min((time - last) / 16.67, 2) : 1;
      last = time;
      ctx.clearRect(0, 0, width, height);
      for (const dot of dots) {
        if (!reduceMotion.matches) {
          dot.x = (dot.x + dot.vx * delta + width) % width;
          dot.y = (dot.y + dot.vy * delta + height) % height;
        }
        const dx = dot.x - mouse.x, dy = dot.y - mouse.y;
        const distance = Math.hypot(dx, dy);
        const near = Math.max(0, 1 - distance / 150);
        const push = near * 14;
        ctx.beginPath();
        ctx.arc(dot.x + (distance ? dx / distance * push : 0), dot.y + (distance ? dy / distance * push : 0), dot.r + near * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(45,94,197,${.16 + near * .4})`;
        ctx.fill();
      }
      if (!reduceMotion.matches) frame = requestAnimationFrame(draw);
    }
    function resize() {
      const bounds = container.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      targetCanvas.width = width * ratio;
      targetCanvas.height = height * ratio;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      dots = Array.from({ length: Math.min(90, Math.floor(width * height / 11000)) }, () => ({
        x: Math.random() * width, y: Math.random() * height, r: Math.random() * .8 + .8,
        vx: (Math.random() - .5) * .15, vy: (Math.random() - .5) * .15,
      }));
      cancelAnimationFrame(frame);
      last = 0;
      frame = requestAnimationFrame(draw);
    }
    const move = (event: PointerEvent) => {
      const bounds = container.getBoundingClientRect();
      mouse.x = event.clientX - bounds.left;
      mouse.y = event.clientY - bounds.top;
      if (reduceMotion.matches) draw(0);
    };
    const leave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
      if (reduceMotion.matches) draw(0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    container.addEventListener("pointermove", move, { passive: true });
    container.addEventListener("pointerleave", leave);
    resize();
    return () => {
      observer.disconnect();
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerleave", leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.interactiveDots} aria-hidden="true" />;
}
